package cmd

import (
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/AlecAivazis/survey/v2"
	"github.com/raids-lab/crater/cli/internal/api"
	"github.com/raids-lab/crater/cli/internal/clierror"
	"github.com/raids-lab/crater/cli/internal/completion"
	"github.com/raids-lab/crater/cli/internal/i18n"
	"github.com/raids-lab/crater/cli/internal/output"
	"github.com/raids-lab/crater/cli/pkg/errorcodes"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var taintEffects = []string{"NoSchedule", "PreferNoSchedule", "NoExecute"}

var nodeCmd = &cobra.Command{
	Use:   "node",
	Short: "Operate cluster nodes",
	Long:  "Operate cluster nodes, including scheduling state, labels, annotations, taints, and drain operations.",
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) > 0 {
			return errUnknownSubcommand(cmd, args[0])
		}
		return cmd.Help()
	},
}

var nodeCordonCmd = &cobra.Command{Use: "cordon <name>", Short: "Mark a node unschedulable", Args: maxOneArg, RunE: runNodeCordon}
var nodeUncordonCmd = &cobra.Command{Use: "uncordon <name>", Short: "Mark a node schedulable", Args: maxOneArg, RunE: runNodeUncordon}
var nodeScheduleToggleCmd = &cobra.Command{Use: "schedule-toggle <name>", Short: "Toggle node scheduling state", Args: maxOneArg, RunE: runNodeScheduleToggle}
var nodeMarkCmd = &cobra.Command{Use: "mark <name>", Short: "List node labels, annotations, and taints", Args: maxOneArg, RunE: runNodeMark}

var nodeLabelCmd = &cobra.Command{Use: "label", Short: "Manage node labels"}
var nodeLabelAddCmd = &cobra.Command{Use: "add <name>", Short: "Add a node label", Args: maxOneArg, RunE: runNodeLabelAdd}
var nodeLabelDeleteCmd = &cobra.Command{Use: "delete <name>", Short: "Delete a node label", Args: maxOneArg, RunE: runNodeLabelDelete}

var nodeAnnotationCmd = &cobra.Command{Use: "annotation", Short: "Manage node annotations"}
var nodeAnnotationAddCmd = &cobra.Command{Use: "add <name>", Short: "Add a node annotation", Args: maxOneArg, RunE: runNodeAnnotationAdd}
var nodeAnnotationDeleteCmd = &cobra.Command{Use: "delete <name>", Short: "Delete a node annotation", Args: maxOneArg, RunE: runNodeAnnotationDelete}

var nodeTaintCmd = &cobra.Command{Use: "taint", Short: "Manage node taints"}
var nodeTaintAddCmd = &cobra.Command{Use: "add <name>", Short: "Add a node taint", Args: maxOneArg, RunE: runNodeTaintAdd}
var nodeTaintDeleteCmd = &cobra.Command{Use: "delete <name>", Short: "Delete a node taint", Args: maxOneArg, RunE: runNodeTaintDelete}

var nodeDrainCmd = &cobra.Command{Use: "drain <name>", Short: "Drain a node", Args: maxOneArg, RunE: runNodeDrain}

func maxOneArg(cmd *cobra.Command, args []string) error {
	if len(args) > 1 {
		return errTooManyArgs(cmd, len(args), 1)
	}
	return nil
}

func requiredArg(args []string, labelKey string, field string) (string, error) {
	if len(args) == 0 || strings.TrimSpace(args[0]) == "" {
		return "", errUsageFromIssues([]usageIssue{missingIssue(field, labelKey)})
	}
	return strings.TrimSpace(args[0]), nil
}

func missingIssue(field string, labelKey string) usageIssue {
	return usageIssue{
		Code:    errorcodes.ErrMissingRequiredFlag,
		Message: i18n.T("err_missing_required", i18n.T(labelKey), field),
		Field:   field,
	}
}

func invalidIssue(field string, message string) usageIssue {
	return usageIssue{Code: errorcodes.ErrInvalidFlagValue, Message: message, Field: field}
}

func runNodeCordon(cmd *cobra.Command, args []string) error {
	return runNodeScheduleSet(cmd, args, true)
}

func runNodeUncordon(cmd *cobra.Command, args []string) error {
	return runNodeScheduleSet(cmd, args, false)
}

func runNodeScheduleSet(cmd *cobra.Command, args []string, wantUnschedulable bool) error {
	name, reason, err := nodeScheduleInputs(cmd, args)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	node, err := client.GetNode(name)
	if err != nil {
		return cliErrFromAPI(err)
	}
	isUnschedulable := strings.EqualFold(node.Status, "Unschedulable") || strings.Contains(strings.ToLower(node.Status), "unschedul")
	if wantUnschedulable == isUnschedulable {
		message := i18n.T("node_schedule_noop", name, node.Status)
		if outputJSON {
			return output.WriteSuccessJSON(os.Stdout, output.SuccessEnvelope(map[string]interface{}{"message": message, "changed": false}))
		}
		fmt.Println(message)
		return nil
	}
	msg, err := client.ToggleNodeSchedule(name, reason)
	return writeMessage(map[string]interface{}{"message": msg, "changed": true}, msg, err)
}

func runNodeScheduleToggle(cmd *cobra.Command, args []string) error {
	name, reason, err := nodeScheduleInputs(cmd, args)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.ToggleNodeSchedule(name, reason)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func nodeScheduleInputs(cmd *cobra.Command, args []string) (string, string, error) {
	name, err := requiredArg(args, "node_label_name", "name")
	if err != nil {
		return "", "", err
	}
	reason, _ := cmd.Flags().GetString("reason")
	if strings.TrimSpace(reason) == "" {
		return "", "", errUsageFromIssues([]usageIssue{missingIssue("reason", "node_label_reason")})
	}
	return name, reason, nil
}

func runNodeMark(_ *cobra.Command, args []string) error {
	name, err := requiredArg(args, "node_label_name", "name")
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	mark, err := client.GetNodeMark(name)
	if err != nil {
		return cliErrFromAPI(err)
	}
	if outputJSON {
		return output.WriteSuccessJSON(os.Stdout, output.SuccessEnvelope(map[string]interface{}{"marks": mark}))
	}
	printNodeMark(mark)
	return nil
}

func runNodeLabelAdd(cmd *cobra.Command, args []string) error {
	name, req, err := nodeLabelInput(cmd, args, true)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.AddNodeLabel(name, req)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func runNodeLabelDelete(cmd *cobra.Command, args []string) error {
	name, req, err := nodeLabelInput(cmd, args, false)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.DeleteNodeLabel(name, req)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func nodeLabelInput(cmd *cobra.Command, args []string, requireValue bool) (string, api.NodeLabel, error) {
	name, err := requiredArg(args, "node_label_name", "name")
	if err != nil {
		return "", api.NodeLabel{}, err
	}
	key, _ := cmd.Flags().GetString("key")
	value, _ := cmd.Flags().GetString("value")
	issues := keyValueIssues(key, value, requireValue)
	if len(issues) > 0 {
		return "", api.NodeLabel{}, errUsageFromIssues(issues)
	}
	return name, api.NodeLabel{Key: key, Value: value}, nil
}

func runNodeAnnotationAdd(cmd *cobra.Command, args []string) error {
	name, req, err := nodeAnnotationInput(cmd, args, true)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.AddNodeAnnotation(name, req)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func runNodeAnnotationDelete(cmd *cobra.Command, args []string) error {
	name, req, err := nodeAnnotationInput(cmd, args, false)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.DeleteNodeAnnotation(name, req)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func nodeAnnotationInput(cmd *cobra.Command, args []string, requireValue bool) (string, api.NodeAnnotation, error) {
	name, err := requiredArg(args, "node_label_name", "name")
	if err != nil {
		return "", api.NodeAnnotation{}, err
	}
	key, _ := cmd.Flags().GetString("key")
	value, _ := cmd.Flags().GetString("value")
	issues := keyValueIssues(key, value, requireValue)
	if len(issues) > 0 {
		return "", api.NodeAnnotation{}, errUsageFromIssues(issues)
	}
	return name, api.NodeAnnotation{Key: key, Value: value}, nil
}

func keyValueIssues(key, value string, requireValue bool) []usageIssue {
	issues := []usageIssue{}
	if strings.TrimSpace(key) == "" {
		issues = append(issues, missingIssue("key", "node_label_key"))
	}
	if requireValue && strings.TrimSpace(value) == "" {
		issues = append(issues, missingIssue("value", "node_label_value"))
	}
	return issues
}

func runNodeTaintAdd(cmd *cobra.Command, args []string) error {
	name, req, err := nodeTaintInput(cmd, args, true)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.AddNodeTaint(name, req)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func runNodeTaintDelete(cmd *cobra.Command, args []string) error {
	name, req, err := nodeTaintInput(cmd, args, false)
	if err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.DeleteNodeTaint(name, req)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func nodeTaintInput(cmd *cobra.Command, args []string, requireReason bool) (string, api.NodeTaint, error) {
	name, err := requiredArg(args, "node_label_name", "name")
	if err != nil {
		return "", api.NodeTaint{}, err
	}
	key, _ := cmd.Flags().GetString("key")
	value, _ := cmd.Flags().GetString("value")
	effect, _ := cmd.Flags().GetString("effect")
	reason, _ := cmd.Flags().GetString("reason")
	issues := []usageIssue{}
	if strings.TrimSpace(key) == "" {
		issues = append(issues, missingIssue("key", "node_label_key"))
	}
	if strings.TrimSpace(value) == "" {
		issues = append(issues, missingIssue("value", "node_label_value"))
	}
	if strings.TrimSpace(effect) == "" {
		issues = append(issues, missingIssue("effect", "node_label_effect"))
	} else if !slices.Contains(taintEffects, effect) {
		issues = append(issues, invalidIssue("effect", i18n.T("err_invalid_enum", "effect", effect)))
	}
	if requireReason && strings.TrimSpace(reason) == "" {
		issues = append(issues, missingIssue("reason", "node_label_reason"))
	}
	if len(issues) > 0 {
		return "", api.NodeTaint{}, errUsageFromIssues(issues)
	}
	return name, api.NodeTaint{Key: key, Value: value, Effect: effect, Reason: reason}, nil
}

func runNodeDrain(cmd *cobra.Command, args []string) error {
	name, err := requiredArg(args, "node_label_name", "name")
	if err != nil {
		return err
	}
	if err := confirmDangerous(cmd, i18n.T("node_drain_confirm", name)); err != nil {
		return err
	}
	client, err := activeAPIClient()
	if err != nil {
		return err
	}
	msg, err := client.DrainNode(name)
	return writeMessage(map[string]interface{}{"message": msg}, msg, err)
}

func confirmDangerous(cmd *cobra.Command, message string) error {
	yes, _ := cmd.Flags().GetBool("yes")
	if viper.GetBool("no-interactive") && !yes {
		return &clierror.Error{
			Category: errorcodes.CategoryUsage,
			Code:     errorcodes.ErrMissingRequiredFlag,
			Message:  i18n.T("err_missing_required", "yes", "yes"),
		}
	}
	if yes {
		return nil
	}
	var confirmed bool
	prompt := &survey.Confirm{Message: message, Default: false}
	if err := survey.AskOne(prompt, &confirmed); err != nil {
		return errSurveyOrSame(err)
	}
	if !confirmed {
		return errOperationCancelled()
	}
	return nil
}

func writeMessage(data map[string]interface{}, text string, err error) error {
	if err != nil {
		return cliErrFromAPI(err)
	}
	if outputJSON {
		return output.WriteSuccessJSON(os.Stdout, output.SuccessEnvelope(data))
	}
	fmt.Println(text)
	return nil
}

func printNodeMark(mark *api.NodeMark) {
	if mark == nil {
		return
	}
	fmt.Println(i18n.T("node_mark_labels"))
	for _, label := range mark.Labels {
		fmt.Printf("%s=%s\n", label.Key, label.Value)
	}
	fmt.Println(i18n.T("node_mark_annotations"))
	for _, annotation := range mark.Annotations {
		fmt.Printf("%s=%s\n", annotation.Key, annotation.Value)
	}
	fmt.Println(i18n.T("node_mark_taints"))
	for _, taint := range mark.Taints {
		fmt.Printf("%s=%s:%s\n", taint.Key, taint.Value, taint.Effect)
	}
}

func addKeyValueFlags(cmd *cobra.Command, requireValue bool) {
	_ = requireValue
	cmd.Flags().String("key", "", "Key")
	cmd.Flags().String("value", "", "Value")
}

func init() {
	for _, cmd := range []*cobra.Command{nodeCordonCmd, nodeUncordonCmd, nodeScheduleToggleCmd} {
		cmd.Flags().String("reason", "", "Operation reason")
	}
	addKeyValueFlags(nodeLabelAddCmd, true)
	addKeyValueFlags(nodeLabelDeleteCmd, false)
	addKeyValueFlags(nodeAnnotationAddCmd, true)
	addKeyValueFlags(nodeAnnotationDeleteCmd, false)
	for _, cmd := range []*cobra.Command{nodeTaintAddCmd, nodeTaintDeleteCmd} {
		cmd.Flags().String("key", "", "Taint key")
		cmd.Flags().String("value", "", "Taint value")
		cmd.Flags().String("effect", "", "Taint effect")
		cmd.Flags().String("reason", "", "Operation reason")
		completion.RegisterFlagValue([]string{"node", "taint", cmd.Name()}, "effect", staticValueCompleter(taintEffects, nil))
	}
	nodeDrainCmd.Flags().BoolP("yes", "y", false, "Confirm node drain")

	nodeLabelCmd.AddCommand(nodeLabelAddCmd, nodeLabelDeleteCmd)
	nodeAnnotationCmd.AddCommand(nodeAnnotationAddCmd, nodeAnnotationDeleteCmd)
	nodeTaintCmd.AddCommand(nodeTaintAddCmd, nodeTaintDeleteCmd)
	nodeCmd.AddCommand(nodeCordonCmd, nodeUncordonCmd, nodeScheduleToggleCmd, nodeMarkCmd, nodeLabelCmd, nodeAnnotationCmd, nodeTaintCmd, nodeDrainCmd)
	rootCmd.AddCommand(nodeCmd)
}
