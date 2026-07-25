package cmd

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/spf13/cobra"

	"github.com/raids-lab/crater/cli/internal/api"
	"github.com/raids-lab/crater/cli/internal/clierror"
	"github.com/raids-lab/crater/cli/internal/completion"
	"github.com/raids-lab/crater/cli/internal/i18n"
	"github.com/raids-lab/crater/cli/internal/output"
	"github.com/raids-lab/crater/cli/pkg/errorcodes"
)

var fileRemoteRoots = []string{"user", "public", "account"}

var fileCmd = &cobra.Command{
	Use:   "file",
	Short: "Manage remote files",
	Long:  "Manage files and directories in user, public, and account storage spaces.",
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 {
			return errUnknownSubcommand(cmd, args[0])
		}
		return cmd.Help()
	},
}

var fileUploadCmd = &cobra.Command{
	Use:   "upload <local-file> <remote-path>",
	Short: "Upload one local file",
	Args:  fileUploadArgs,
	RunE:  runFileUpload,
}

type fileUploadDeps struct {
	client func() (api.FileUploadClient, error)
	stdout io.Writer
	json   bool
}

type fileUploadInput struct {
	localPath  string
	remotePath string
	overwrite  bool
}

type fileUploadResult struct {
	LocalPath   string
	RemotePath  string
	Bytes       int64
	Overwrite   bool
	Overwritten bool
}

func fileUploadArgs(cmd *cobra.Command, args []string) error {
	if len(args) > 2 {
		return errTooManyArgs(cmd, len(args), 2)
	}
	if len(args) < 2 {
		field := "local-file"
		label := i18n.T("file_label_local_file")
		if len(args) == 1 {
			field = "remote-path"
			label = i18n.T("file_label_remote_file")
		}
		return errUsageFromIssues([]usageIssue{{
			Code:    errorcodes.ErrMissingRequiredFlag,
			Message: i18n.T("err_missing_required_arg", label, field),
			Field:   field,
		}})
	}
	return nil
}

func runFileUpload(cmd *cobra.Command, args []string) error {
	return runFileUploadWith(cmd, args, fileUploadDeps{
		client: activeFileUploadClient,
		stdout: os.Stdout,
		json:   outputJSON,
	})
}

func activeFileUploadClient() (api.FileUploadClient, error) {
	return activeAPIClient()
}

func runFileUploadWith(cmd *cobra.Command, args []string, deps fileUploadDeps) error {
	remotePath, err := normalizeRemotePath(args[1], false)
	if err != nil {
		return err
	}
	if len(strings.Split(remotePath, "/")) < 2 {
		return invalidRemotePathIssue(i18n.T("err_file_path_not_file", args[1]))
	}

	source, err := openUploadSource(args[0])
	if err != nil {
		return err
	}
	defer source.Close()

	overwrite, _ := cmd.Flags().GetBool("overwrite")
	result, err := uploadRemoteFile(cmd.Context(), deps.client, source, fileUploadInput{
		localPath:  args[0],
		remotePath: remotePath,
		overwrite:  overwrite,
	})
	if err != nil {
		return err
	}
	return writeFileUploadResult(deps.stdout, deps.json, result)
}

func openUploadSource(localPath string) (*os.File, error) {
	pathInfo, err := os.Stat(localPath)
	if err != nil {
		return nil, localFileError("err_file_local_stat", localPath, err)
	}
	if !pathInfo.Mode().IsRegular() {
		return nil, invalidLocalPathIssue(i18n.T("err_file_local_not_regular", localPath))
	}

	source, err := openUploadFileNoBlock(localPath)
	if err != nil {
		return nil, localFileError("err_file_local_open", localPath, err)
	}
	info, err := source.Stat()
	if err != nil {
		_ = source.Close()
		return nil, localFileError("err_file_local_stat", localPath, err)
	}
	if !info.Mode().IsRegular() {
		_ = source.Close()
		return nil, invalidLocalPathIssue(i18n.T("err_file_local_not_regular", localPath))
	}
	return source, nil
}

func uploadRemoteFile(
	ctx context.Context,
	clientFactory func() (api.FileUploadClient, error),
	source io.Reader,
	input fileUploadInput,
) (fileUploadResult, error) {
	client, err := clientFactory()
	if err != nil {
		return fileUploadResult{}, err
	}

	uploaded, err := client.UploadFile(ctx, input.remotePath, source, input.overwrite)
	if err != nil {
		var sourceErr *api.SourceReadError
		if errors.As(err, &sourceErr) {
			return fileUploadResult{}, localFileError("err_file_local_read", input.localPath, sourceErr.Cause)
		}
		return fileUploadResult{}, cliErrFromAPI(err)
	}
	return fileUploadResult{
		LocalPath:   input.localPath,
		RemotePath:  uploaded.RemotePath,
		Bytes:       uploaded.Bytes,
		Overwrite:   input.overwrite,
		Overwritten: uploaded.Overwritten,
	}, nil
}

func writeFileUploadResult(writer io.Writer, jsonOutput bool, result fileUploadResult) error {
	if jsonOutput {
		return output.WriteSuccessJSON(writer, output.SuccessEnvelope(map[string]interface{}{
			"local_path":  result.LocalPath,
			"remote_path": result.RemotePath,
			"bytes":       result.Bytes,
			"overwrite":   result.Overwrite,
			"overwritten": result.Overwritten,
		}))
	}
	_, err := fmt.Fprintln(writer, i18n.T("file_upload_success", result.LocalPath, result.RemotePath, result.Bytes))
	if err != nil {
		return &clierror.Error{
			Category: errorcodes.CategorySystem,
			Code:     errorcodes.ErrCommandExecution,
			Message:  i18n.T("err_file_output", err.Error()),
			Context:  map[string]interface{}{"msg": err.Error()},
		}
	}
	return nil
}

func normalizeRemotePath(remotePath string, allowEmpty bool) (string, error) {
	if remotePath == "" {
		if allowEmpty {
			return "", nil
		}
		return "", invalidRemotePathIssue(i18n.T("err_file_path_invalid", remotePath))
	}
	if strings.ContainsRune(remotePath, '\\') {
		return "", invalidRemotePathIssue(i18n.T("err_file_path_invalid", remotePath))
	}
	for _, character := range remotePath {
		if unicode.IsControl(character) {
			return "", invalidRemotePathIssue(i18n.T("err_file_path_invalid", remotePath))
		}
	}

	trimmed := strings.Trim(remotePath, "/")
	rawSegments := strings.Split(trimmed, "/")
	segments := make([]string, 0, len(rawSegments))
	for _, segment := range rawSegments {
		if segment == ".." {
			return "", invalidRemotePathIssue(i18n.T("err_file_path_invalid", remotePath))
		}
		if segment == "" || segment == "." {
			continue
		}
		segments = append(segments, segment)
	}
	if len(segments) == 0 {
		if allowEmpty {
			return "", nil
		}
		return "", invalidRemotePathIssue(i18n.T("err_file_path_invalid", remotePath))
	}
	if !isFileRemoteRoot(segments[0]) {
		return "", invalidRemotePathIssue(i18n.T("err_file_path_root", remotePath))
	}
	return strings.Join(segments, "/"), nil
}

func invalidRemotePathIssue(message string) error {
	return errUsageFromIssues([]usageIssue{{
		Code:    errorcodes.ErrInvalidFlagValue,
		Message: message,
		Field:   "remote-path",
	}})
}

func invalidLocalPathIssue(message string) error {
	return errUsageFromIssues([]usageIssue{{
		Code:    errorcodes.ErrInvalidFlagValue,
		Message: message,
		Field:   "local-file",
	}})
}

func localFileError(key, localPath string, cause error) *clierror.Error {
	return &clierror.Error{
		Category: errorcodes.CategorySystem,
		Code:     errorcodes.ErrCommandExecution,
		Message:  i18n.T(key, localPath, cause.Error()),
		Context: map[string]interface{}{
			"path": localPath,
			"msg":  cause.Error(),
		},
	}
}

func isFileRemoteRoot(value string) bool {
	for _, root := range fileRemoteRoots {
		if value == root {
			return true
		}
	}
	return false
}

func fileRemoteRootCompleter(ctx completion.Context) ([]completion.Candidate, error) {
	prefix := strings.ToLower(completion.CurrentWordPrefix(ctx))
	candidates := make([]completion.Candidate, 0, len(fileRemoteRoots))
	for _, root := range fileRemoteRoots {
		if prefix != "" && !strings.HasPrefix(root, prefix) {
			continue
		}
		candidates = append(candidates, completion.Candidate{
			Value:       root,
			Description: i18n.T("file_root_" + root + "_desc"),
		})
	}
	return candidates, nil
}

func fileLocalPathCompleter(ctx completion.Context) ([]completion.Candidate, error) {
	prefix := completion.CurrentWordPrefix(ctx)
	directoryPrefix, namePrefix := filepath.Split(prefix)
	directory := directoryPrefix
	if directory == "" {
		directory = "."
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		return nil, nil
	}

	candidates := make([]completion.Candidate, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, namePrefix) ||
			(namePrefix == "" && strings.HasPrefix(name, ".")) {
			continue
		}
		fullPath := filepath.Join(directory, name)
		info, err := os.Stat(fullPath)
		if err != nil {
			continue
		}
		value := directoryPrefix + name
		description := i18n.T("file_local_regular_desc")
		switch {
		case info.IsDir():
			value += string(filepath.Separator)
			description = i18n.T("file_local_directory_desc")
		case !info.Mode().IsRegular():
			continue
		}
		candidates = append(candidates, completion.Candidate{
			Value:       value,
			Description: description,
		})
	}
	return candidates, nil
}

func init() {
	fileUploadCmd.Flags().Bool("overwrite", false, "Replace an existing remote file")
	fileRemoveCmd.Flags().Bool("recursive", false, "Remove a directory and all of its contents")
	fileRemoveCmd.Flags().BoolP("yes", "y", false, "Remove without confirmation")
	fileCmd.AddCommand(fileMkdirCmd, fileMoveCmd, fileRemoveCmd, fileUploadCmd)
	rootCmd.AddCommand(fileCmd)
	completion.RegisterPositional([]string{"file", "mkdir"}, 0, fileRemoteRootCompleter)
	completion.RegisterPositional([]string{"file", "mv"}, 0, fileRemoteRootCompleter)
	completion.RegisterPositional([]string{"file", "mv"}, 1, fileRemoteRootCompleter)
	completion.RegisterPositional([]string{"file", "rm"}, 0, fileRemoteRootCompleter)
	completion.RegisterPositional([]string{"file", "upload"}, 0, fileLocalPathCompleter)
	completion.RegisterPositional([]string{"file", "upload"}, 1, fileRemoteRootCompleter)
}
