package cmd

import (
	"bytes"
	"context"
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"

	"github.com/raids-lab/crater/cli/internal/api"
	"github.com/raids-lab/crater/cli/internal/clierror"
	"github.com/raids-lab/crater/cli/pkg/errorcodes"
	"github.com/spf13/cobra"
)

func TestReadJobLogOptionsAggregatesLocalErrors(t *testing.T) {
	cmd := &cobra.Command{}
	addJobLogFlags(cmd)
	for name, value := range map[string]string{
		"pod":            "pod-1",
		"all-pods":       "true",
		"container":      "trainer",
		"all-containers": "true",
		"tail":           "-1",
		"follow":         "true",
		"previous":       "true",
	} {
		if err := cmd.Flags().Set(name, value); err != nil {
			t.Fatal(err)
		}
	}
	_, err := readJobLogOptions(cmd)
	var cliErr *clierror.Error
	if !errors.As(err, &cliErr) {
		t.Fatalf("error = %v, want clierror", err)
	}
	issues, ok := cliErr.Context["issues"].([]map[string]interface{})
	if !ok || len(issues) != 4 {
		t.Fatalf("issues = %#v, want 4 aggregated issues", cliErr.Context["issues"])
	}
}

func TestSelectJobLogPodsRequiresChoiceForDistributedJob(t *testing.T) {
	pods := []api.PodDetail{
		{Name: "worker-1", Namespace: "ns"},
		{Name: "master-0", Namespace: "ns"},
	}
	_, err := selectJobLogPods(pods, jobLogOptions{})
	var cliErr *clierror.Error
	if !errors.As(err, &cliErr) {
		t.Fatalf("error = %v, want clierror", err)
	}
	if cliErr.Code != errorcodes.ErrMissingRequiredFlag {
		t.Fatalf("code = %s", cliErr.Code)
	}
	if got := cliErr.Context["available_pods"]; !reflect.DeepEqual(got, []string{"master-0", "worker-1"}) {
		t.Fatalf("available_pods = %#v", got)
	}
}

func TestSelectJobLogPodsSupportsExplicitAndAll(t *testing.T) {
	pods := []api.PodDetail{
		{Name: "worker-1", Namespace: "ns"},
		{Name: "master-0", Namespace: "ns"},
	}
	selected, err := selectJobLogPods(pods, jobLogOptions{Pod: "worker-1"})
	if err != nil {
		t.Fatalf("select explicit pod: %v", err)
	}
	if len(selected) != 1 || selected[0].Name != "worker-1" {
		t.Fatalf("selected = %#v", selected)
	}

	selected, err = selectJobLogPods(pods, jobLogOptions{AllPods: true})
	if err != nil {
		t.Fatalf("select all pods: %v", err)
	}
	if got := podNames(selected); !reflect.DeepEqual(got, []string{"master-0", "worker-1"}) {
		t.Fatalf("pods = %#v", got)
	}
}

func TestSelectJobLogContainersDefaultsToBusinessContainer(t *testing.T) {
	containers := []api.PodContainerInfo{
		{Name: "init-data", IsInitContainer: true},
		{Name: "trainer"},
	}
	selected, err := selectJobLogContainers("pod-1", containers, jobLogOptions{})
	if err != nil {
		t.Fatalf("select containers: %v", err)
	}
	if len(selected) != 1 || selected[0].Name != "trainer" {
		t.Fatalf("selected = %#v", selected)
	}
}

func TestSelectJobLogContainersRequiresChoiceForSidecars(t *testing.T) {
	containers := []api.PodContainerInfo{{Name: "trainer"}, {Name: "metrics"}}
	_, err := selectJobLogContainers("pod-1", containers, jobLogOptions{})
	var cliErr *clierror.Error
	if !errors.As(err, &cliErr) {
		t.Fatalf("error = %v, want clierror", err)
	}
	if cliErr.Code != errorcodes.ErrMissingRequiredFlag {
		t.Fatalf("code = %s", cliErr.Code)
	}
	if got := cliErr.Context["available_containers"]; !reflect.DeepEqual(got, []string{"metrics", "trainer"}) {
		t.Fatalf("available_containers = %#v", got)
	}
}

func TestWriteJobLogsPrefixesMultipleSources(t *testing.T) {
	results := []jobLogResult{
		{Pod: "master-0", Container: "master", Content: "ready\n"},
		{Pod: "worker-0", Container: "worker", Content: "step 1\nstep 2"},
	}
	var got bytes.Buffer
	if err := writeJobLogs(&got, results, true); err != nil {
		t.Fatalf("writeJobLogs: %v", err)
	}
	want := "[master-0/master] ready\n" +
		"[worker-0/worker] step 1\n" +
		"[worker-0/worker] step 2\n"
	if got.String() != want {
		t.Fatalf("output = %q, want %q", got.String(), want)
	}
}

func TestLinePrefixWriterHandlesChunkBoundaries(t *testing.T) {
	var got bytes.Buffer
	writer := &linePrefixWriter{
		dst:         &got,
		prefix:      []byte("[pod/container] "),
		atLineStart: true,
	}
	for _, chunk := range [][]byte{[]byte("first"), []byte(" line\nsecond"), []byte(" line\n")} {
		if _, err := writer.Write(chunk); err != nil {
			t.Fatalf("Write: %v", err)
		}
	}
	want := "[pod/container] first line\n[pod/container] second line\n"
	if got.String() != want {
		t.Fatalf("output = %q, want %q", got.String(), want)
	}
}

func TestLinePrefixWriterRejectsShortPrefixWrite(t *testing.T) {
	writer := &linePrefixWriter{
		dst:         shortWriter{},
		prefix:      []byte("[pod/container] "),
		atLineStart: true,
	}
	if _, err := writer.Write([]byte("line\n")); !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("error = %v, want io.ErrShortWrite", err)
	}
}

func TestCliErrFromPodLogClassifiesLocalFailures(t *testing.T) {
	t.Run("cancelled", func(t *testing.T) {
		err := cliErrFromPodLog(context.Canceled)
		var cliErr *clierror.Error
		if !errors.As(err, &cliErr) || cliErr.Category != errorcodes.CategoryCancelled {
			t.Fatalf("error = %#v", err)
		}
	})

	t.Run("writer", func(t *testing.T) {
		err := cliErrFromPodLog(&api.PodLogWriteError{Cause: io.ErrClosedPipe})
		var cliErr *clierror.Error
		if !errors.As(err, &cliErr) ||
			cliErr.Category != errorcodes.CategorySystem ||
			cliErr.Code != errorcodes.ErrCommandExecution {
			t.Fatalf("error = %#v", err)
		}
	})

	t.Run("protocol", func(t *testing.T) {
		err := cliErrFromPodLog(&api.PodLogProtocolError{Cause: errors.New("bad frame")})
		var cliErr *clierror.Error
		if !errors.As(err, &cliErr) ||
			cliErr.Category != errorcodes.CategoryAPI ||
			cliErr.Code != errorcodes.ErrAPIVersionMismatch ||
			!strings.Contains(cliErr.Message, "bad frame") {
			t.Fatalf("error = %#v", err)
		}
	})
}

type shortWriter struct{}

func (shortWriter) Write(data []byte) (int, error) {
	if len(data) == 0 {
		return 0, nil
	}
	return len(data) - 1, nil
}
