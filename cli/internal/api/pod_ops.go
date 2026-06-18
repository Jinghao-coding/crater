package api

import (
	"fmt"
	"io"
	"net/url"
)

type PodIngress struct {
	Name   string `json:"name"`
	Port   int32  `json:"port"`
	Prefix string `json:"prefix"`
}

type PodIngressRequest struct {
	Name string `json:"name"`
	Port int32  `json:"port"`
}

type PodIngressList struct {
	Ingresses []PodIngress `json:"ingresses"`
}

type PodNodeport struct {
	Name          string `json:"name"`
	ContainerPort int32  `json:"containerPort"`
	Address       string `json:"address"`
	NodePort      int32  `json:"nodePort"`
	ServiceName   string `json:"ServiceName,omitempty"`
}

type PodNodeportRequest struct {
	Name          string `json:"name"`
	ContainerPort int32  `json:"containerPort"`
}

type PodNodeportList struct {
	NodePorts []PodNodeport `json:"nodeports"`
}

type PodResourceRequest struct {
	Resources map[string]string `json:"resources"`
}

func podPath(namespace, pod string, suffix string) string {
	path := NamespacesPrefix + "/" + url.PathEscape(namespace) + "/pods/" + url.PathEscape(pod)
	if suffix != "" {
		path += "/" + suffix
	}
	return path
}

func adminPodPath(namespace, pod string, suffix string) string {
	path := AdminNamespacesPrefix + "/" + url.PathEscape(namespace) + "/pods/" + url.PathEscape(pod)
	if suffix != "" {
		path += "/" + suffix
	}
	return path
}

func (c *Client) GetPodLog(namespace, pod, container string, tail *int64, timestamps, previous bool) (string, error) {
	var result Response[string]
	req := c.httpClient.R().
		SetSuccessResult(&result).
		SetErrorResult(&result).
		SetQueryParam("timestamps", fmt.Sprintf("%t", timestamps)).
		SetQueryParam("previous", fmt.Sprintf("%t", previous)).
		SetQueryParam("follow", "false")
	if tail != nil {
		req.SetQueryParam("tailLines", fmt.Sprintf("%d", *tail))
	}
	resp, err := req.Get(podPath(namespace, pod, "containers/"+url.PathEscape(container)+"/log"))
	if err != nil {
		return "", &NetworkError{Cause: err}
	}
	if err := errorFromResponse(resp, result.Code, result.Message); err != nil {
		return "", err
	}
	return result.Data, nil
}

func (c *Client) StreamPodLog(namespace, pod, container string, tail *int64, timestamps, previous bool, writer io.Writer) error {
	logs, err := c.getPodLogWithFollow(namespace, pod, container, tail, timestamps, previous, true)
	if err != nil {
		return err
	}
	_, err = io.WriteString(writer, logs)
	if err != nil {
		return &NetworkError{Cause: err}
	}
	return nil
}

func (c *Client) getPodLogWithFollow(namespace, pod, container string, tail *int64, timestamps, previous, follow bool) (string, error) {
	var result Response[string]
	req := c.httpClient.R().
		SetSuccessResult(&result).
		SetErrorResult(&result).
		SetQueryParam("timestamps", fmt.Sprintf("%t", timestamps)).
		SetQueryParam("previous", fmt.Sprintf("%t", previous)).
		SetQueryParam("follow", fmt.Sprintf("%t", follow))
	if tail != nil {
		req.SetQueryParam("tailLines", fmt.Sprintf("%d", *tail))
	}
	suffix := "containers/" + url.PathEscape(container) + "/log"
	if follow {
		suffix += "/stream"
	}
	resp, err := req.Get(podPath(namespace, pod, suffix))
	if err != nil {
		return "", &NetworkError{Cause: err}
	}
	if err := errorFromResponse(resp, result.Code, result.Message); err != nil {
		return "", err
	}
	return result.Data, nil
}

func (c *Client) ListPodIngresses(namespace, pod string) (*PodIngressList, error) {
	var result Response[PodIngressList]
	resp, err := c.httpClient.R().
		SetSuccessResult(&result).
		SetErrorResult(&result).
		Get(podPath(namespace, pod, "ingresses"))
	if err != nil {
		return nil, &NetworkError{Cause: err}
	}
	if err := errorFromResponse(resp, result.Code, result.Message); err != nil {
		return nil, err
	}
	return &result.Data, nil
}

func (c *Client) CreatePodIngress(namespace, pod string, req PodIngressRequest) (map[string]string, error) {
	var result Response[map[string]string]
	resp, err := c.httpClient.R().
		SetBody(req).
		SetSuccessResult(&result).
		SetErrorResult(&result).
		Post(podPath(namespace, pod, "ingresses"))
	if err != nil {
		return nil, &NetworkError{Cause: err}
	}
	if err := errorFromResponse(resp, result.Code, result.Message); err != nil {
		return nil, err
	}
	return result.Data, nil
}

func (c *Client) DeletePodIngress(namespace, pod string, req PodIngressRequest) (string, error) {
	return c.podMessage("DELETE", podPath(namespace, pod, "ingresses"), req)
}

func (c *Client) ListPodNodeports(namespace, pod string) (*PodNodeportList, error) {
	var result Response[PodNodeportList]
	resp, err := c.httpClient.R().
		SetSuccessResult(&result).
		SetErrorResult(&result).
		Get(podPath(namespace, pod, "nodeports"))
	if err != nil {
		return nil, &NetworkError{Cause: err}
	}
	if err := errorFromResponse(resp, result.Code, result.Message); err != nil {
		return nil, err
	}
	return &result.Data, nil
}

func (c *Client) CreatePodNodeport(namespace, pod string, req PodNodeportRequest) (map[string]interface{}, error) {
	var result Response[map[string]interface{}]
	resp, err := c.httpClient.R().
		SetBody(req).
		SetSuccessResult(&result).
		SetErrorResult(&result).
		Post(podPath(namespace, pod, "nodeports"))
	if err != nil {
		return nil, &NetworkError{Cause: err}
	}
	if err := errorFromResponse(resp, result.Code, result.Message); err != nil {
		return nil, err
	}
	return result.Data, nil
}

func (c *Client) DeletePodNodeport(namespace, pod string, req PodNodeportRequest) (string, error) {
	return c.podMessage("DELETE", podPath(namespace, pod, "nodeports"), req)
}

func (c *Client) UpdatePodResources(namespace, pod, container string, resources map[string]string) (string, error) {
	suffix := "resources"
	if container != "" {
		suffix = "containers/" + url.PathEscape(container) + "/resources"
	}
	return c.podMessage("PUT", adminPodPath(namespace, pod, suffix), PodResourceRequest{Resources: resources})
}

func (c *Client) podMessage(method, path string, body interface{}) (string, error) {
	var result Response[string]
	req := c.httpClient.R().
		SetBody(body).
		SetSuccessResult(&result).
		SetErrorResult(&result)
	var resp responseStatus
	var err error
	switch method {
	case "PUT":
		resp, err = req.Put(path)
	case "DELETE":
		resp, err = req.Delete(path)
	default:
		return "", fmt.Errorf("unsupported method %s", method)
	}
	if err != nil {
		return "", &NetworkError{Cause: err}
	}
	if err := errorFromResponse(resp, result.Code, result.Message); err != nil {
		return "", err
	}
	return result.Data, nil
}
