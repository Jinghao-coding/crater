package cmd

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/raids-lab/crater/cli/internal/api"
	"github.com/raids-lab/crater/cli/internal/i18n"
	"github.com/raids-lab/crater/cli/internal/output"
	"github.com/raids-lab/crater/cli/pkg/errorcodes"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var podCmd = &cobra.Command{
	Use:   "pod",
	Short: "Operate pods",
	Long:  "Operate pod logs, external access rules, and administrator resource updates.",
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 {
			return errUnknownSubcommand(cmd, args[0])
		}
		return cmd.Help()
	},
}

var podLogsCmd = &cobra.Command{Use: "logs <namespace> <pod> <container>", Short: "Show pod container logs", Args: exactArgs(3), RunE: runPodLogs}

var podIngressCmd = &cobra.Command{Use: "ingress", Short: "Manage pod ingress rules"}
var podIngressLsCmd = &cobra.Command{Use: "ls <namespace> <pod>", Short: "List pod ingress rules", Args: exactArgs(2), RunE: runPodIngressLs}
var podIngressCreateCmd = &cobra.Command{Use: "create <namespace> <pod>", Short: "Create a pod ingress rule", Args: exactArgs(2), RunE: runPodIngressCreate}
var podIngressDeleteCmd = &cobra.Command{Use: "delete <namespace> <pod>", Short: "Delete a pod ingress rule", Args: exactArgs(2), RunE: runPodIngressDelete}

var podNodeportCmd = &cobra.Command{Use: "nodeport", Short: "Manage pod NodePort rules"}
var podNodeportLsCmd = &cobra.Command{Use: "ls <namespace> <pod>", Short: "List pod NodePort rules", Args: exactArgs(2), RunE: runPodNodeportLs}
var podNodeportCreateCmd = &cobra.Command{Use: "create <namespace> <pod>", Short: "Create a pod NodePort rule", Args: exactArgs(2), RunE: runPodNodeportCreate}
var podNodeportDeleteCmd = &cobra.Command{Use: "delete <namespace> <pod>", Short: "Delete a pod NodePort rule", Args: exactArgs(2), RunE: runPodNodeportDelete}

var podResourcesCmd = &cobra.Command{Use: "resources", Short: "Manage pod resources"}
var podResourcesUpdateCmd = &cobra.Command{Use: "update <namespace> <pod>", Short: "Update pod or container resources", Args: exactArgs(2), RunE: runPodResourcesUpdate}

func exactArgs(n int) cobra.PositionalArgs {
	return func(cmd *cobra.Command, args []string) error {
		if len(args) != n {
			return errUsageFromIssues([]usageIssue{{
				Code:    errorcodes.ErrMissingRequiredFlag,
				Message: i18n.T("err_exact_args", cmd.CommandPath(), n, len(args)),
				Field:   "args",
			}})
		}
		for i, arg := range args {
			if strings.TrimSpace(arg) == "" {
				return errUsageFromIssues([]usageIssue{invalidIssue(fmt.Sprintf("arg%d", i), i18n.T("err_prompt_empty", "arg"))})
			}
		}
		return nil
	}
}

func runPodLogs(cmd *cobra.Command, args []string) error {
	namespace, pod, container := args[0], args[1], args[2]
	tail, _ := cmd.Flags().GetInt64("tail")
	timestamps, _ := cmd.Flags().GetBool("timestamps")
	previous, _ := cmd.Flags().GetBool("previous")
	follow, _ := cmd.Flags().GetBool("follow")
	if tail < 0 {
		return errUsageFromIssues([]usageIssue{invalidIssue("tail", i18n.T("err_invalid_non_negative_int", "tail"))})
	}
	if follow && outputJSON {
		return errUsageFromIssues([]usageIssue{invalidIssue("follow", i18n.T("err_follow_json_unsupported"))})
	}
	var tailPtr *int64
	if cmd.Flags().Changed("tail") {
		tailPtr = &tail
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	if follow {
		if err := client.StreamPodLog(namespace, pod, container, tailPtr, timestamps, previous, os.Stdout); err != nil {
			return cliErrFromAPI(err)
		}
		return nil
	}
	logs, err := client.GetPodLog(namespace, pod, container, tailPtr, timestamps, previous)
	if err != nil {
		return cliErrFromAPI(err)
	}
	if outputJSON {
		return output.WriteSuccessJSON(os.Stdout, output.SuccessEnvelope(map[string]interface{}{"logs": logs}))
	}
	fmt.Print(logs)
	if logs != "" && !strings.HasSuffix(logs, "\n") {
		fmt.Println()
	}
	return nil
}

func runPodIngressLs(_ *cobra.Command, args []string) error {
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	resp, err := client.ListPodIngresses(args[0], args[1])
	if err != nil {
		return cliErrFromAPI(err)
	}
	if outputJSON {
		return output.WriteSuccessJSON(os.Stdout, output.SuccessEnvelope(map[string]interface{}{"ingresses": resp.Ingresses}))
	}
	printIngresses(resp.Ingresses)
	return nil
}

func runPodIngressCreate(cmd *cobra.Command, args []string) error {
	req, err := ingressRequest(cmd)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	data, err := client.CreatePodIngress(args[0], args[1], req)
	if err != nil {
		return cliErrFromAPI(err)
	}
	if outputJSON {
		return output.WriteSuccessJSON(os.Stdout, output.SuccessEnvelope(map[string]interface{}{"ingress": data}))
	}
	fmt.Println(formatMap(data))
	return nil
}

func runPodIngressDelete(cmd *cobra.Command, args []string) error {
	req, err := ingressRequest(cmd)
	if err != nil {
		return err
	}
	if err := confirmDangerous(cmd, i18n.T("pod_ingress_delete_confirm", req.Name, args[1])); err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.DeletePodIngress(args[0], args[1], req)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func ingressRequest(cmd *cobra.Command) (api.PodIngressRequest, error) {
	name, _ := cmd.Flags().GetString("name")
	port, _ := cmd.Flags().GetInt32("port")
	issues := []usageIssue{}
	if strings.TrimSpace(name) == "" {
		issues = append(issues, missingIssue("name", "pod_label_rule_name"))
	}
	if port <= 0 || port > 65535 {
		issues = append(issues, invalidIssue("port", i18n.T("err_invalid_port", "port")))
	}
	if len(issues) > 0 {
		return api.PodIngressRequest{}, errUsageFromIssues(issues)
	}
	return api.PodIngressRequest{Name: name, Port: port}, nil
}

func runPodNodeportLs(_ *cobra.Command, args []string) error {
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	resp, err := client.ListPodNodeports(args[0], args[1])
	if err != nil {
		return cliErrFromAPI(err)
	}
	if outputJSON {
		return output.WriteSuccessJSON(os.Stdout, output.SuccessEnvelope(map[string]interface{}{"nodeports": resp.NodePorts}))
	}
	printNodeports(resp.NodePorts)
	return nil
}

func runPodNodeportCreate(cmd *cobra.Command, args []string) error {
	req, err := nodeportRequest(cmd)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	data, err := client.CreatePodNodeport(args[0], args[1], req)
	if err != nil {
		return cliErrFromAPI(err)
	}
	if outputJSON {
		return output.WriteSuccessJSON(os.Stdout, output.SuccessEnvelope(map[string]interface{}{"nodeport": data}))
	}
	fmt.Println(formatMap(data))
	return nil
}

func runPodNodeportDelete(cmd *cobra.Command, args []string) error {
	req, err := nodeportRequest(cmd)
	if err != nil {
		return err
	}
	if err := confirmDangerous(cmd, i18n.T("pod_nodeport_delete_confirm", req.Name, args[1])); err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.DeletePodNodeport(args[0], args[1], req)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func nodeportRequest(cmd *cobra.Command) (api.PodNodeportRequest, error) {
	name, _ := cmd.Flags().GetString("name")
	port, _ := cmd.Flags().GetInt32("container-port")
	issues := []usageIssue{}
	if strings.TrimSpace(name) == "" {
		issues = append(issues, missingIssue("name", "pod_label_rule_name"))
	}
	if port <= 0 || port > 65535 {
		issues = append(issues, invalidIssue("container-port", i18n.T("err_invalid_port", "container-port")))
	}
	if len(issues) > 0 {
		return api.PodNodeportRequest{}, errUsageFromIssues(issues)
	}
	return api.PodNodeportRequest{Name: name, ContainerPort: port}, nil
}

func runPodResourcesUpdate(cmd *cobra.Command, args []string) error {
	container, _ := cmd.Flags().GetString("container")
	cpu, _ := cmd.Flags().GetString("cpu")
	memory, _ := cmd.Flags().GetString("memory")
	resources := map[string]string{}
	issues := []usageIssue{}
	if strings.TrimSpace(cpu) != "" {
		if strings.HasPrefix(strings.TrimSpace(cpu), "-") {
			issues = append(issues, invalidIssue("cpu", i18n.T("err_invalid_non_negative_int", "cpu")))
		} else {
			resources["cpu"] = cpu
		}
	}
	if strings.TrimSpace(memory) != "" {
		if strings.HasPrefix(strings.TrimSpace(memory), "-") {
			issues = append(issues, invalidIssue("memory", i18n.T("err_invalid_non_negative_int", "memory")))
		} else {
			resources["memory"] = memory
		}
	}
	if len(resources) == 0 && len(issues) == 0 {
		issues = append(issues, invalidIssue("resources", i18n.T("err_resource_required")))
	}
	if len(issues) > 0 {
		return errUsageFromIssues(issues)
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.UpdatePodResources(args[0], args[1], container, resources)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func printIngresses(items []api.PodIngress) {
	fmt.Printf("%s %s %s\n", pad("NAME", 18), pad("PORT", 8), "PREFIX")
	for _, item := range items {
		fmt.Printf("%s %s %s\n", pad(item.Name, 18), pad(strconv.Itoa(int(item.Port)), 8), item.Prefix)
	}
}

func printNodeports(items []api.PodNodeport) {
	fmt.Printf("%s %s %s %s\n", pad("NAME", 18), pad("CONTAINER", 12), pad("NODEPORT", 10), "ADDRESS")
	for _, item := range items {
		fmt.Printf("%s %s %s %s\n",
			pad(item.Name, 18),
			pad(strconv.Itoa(int(item.ContainerPort)), 12),
			pad(strconv.Itoa(int(item.NodePort)), 10),
			item.Address)
	}
}

func pad(s string, width int) string {
	return i18n.PadRight(s, width)
}

func formatMap[K comparable, V any](m map[K]V) string {
	parts := make([]string, 0, len(m))
	for k, v := range m {
		parts = append(parts, fmt.Sprintf("%v=%v", k, v))
	}
	return strings.Join(parts, " ")
}

func init() {
	podLogsCmd.Flags().Int64("tail", 0, "Number of lines from the end of logs")
	podLogsCmd.Flags().Bool("timestamps", false, "Include timestamps")
	podLogsCmd.Flags().Bool("previous", false, "Return previous terminated container logs")
	podLogsCmd.Flags().BoolP("follow", "f", false, "Follow log stream")

	for _, cmd := range []*cobra.Command{podIngressCreateCmd, podIngressDeleteCmd} {
		cmd.Flags().String("name", "", "Rule name")
		cmd.Flags().Int32("port", 0, "Container port")
	}
	for _, cmd := range []*cobra.Command{podIngressDeleteCmd, podNodeportDeleteCmd} {
		cmd.Flags().BoolP("yes", "y", false, "Confirm deletion")
	}
	for _, cmd := range []*cobra.Command{podNodeportCreateCmd, podNodeportDeleteCmd} {
		cmd.Flags().String("name", "", "Rule name")
		cmd.Flags().Int32("container-port", 0, "Container port")
	}
	podResourcesUpdateCmd.Flags().String("container", "", "Container name")
	podResourcesUpdateCmd.Flags().String("cpu", "", "CPU quantity")
	podResourcesUpdateCmd.Flags().String("memory", "", "Memory quantity")
	_ = viper.GetBool("json")

	podIngressCmd.AddCommand(podIngressLsCmd, podIngressCreateCmd, podIngressDeleteCmd)
	podNodeportCmd.AddCommand(podNodeportLsCmd, podNodeportCreateCmd, podNodeportDeleteCmd)
	podResourcesCmd.AddCommand(podResourcesUpdateCmd)
	podCmd.AddCommand(podLogsCmd, podIngressCmd, podNodeportCmd, podResourcesCmd)
	rootCmd.AddCommand(podCmd)
}
