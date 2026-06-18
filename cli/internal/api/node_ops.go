package api

import (
	"fmt"
	"net/url"
)

type NodeBrief struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

type NodeScheduleRequest struct {
	Reason string `json:"reason"`
}

type NodeLabel struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type NodeAnnotation struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type NodeTaint struct {
	Key    string `json:"key"`
	Value  string `json:"value"`
	Effect string `json:"effect"`
	Reason string `json:"reason,omitempty"`
}

type NodeMark struct {
	Labels      []NodeLabel      `json:"labels"`
	Annotations []NodeAnnotation `json:"annotations"`
	Taints      []NodeTaint      `json:"taints"`
}

func (c *Client) GetNode(name string) (*NodeBrief, error) {
	var result Response[NodeBrief]
	resp, err := c.httpClient.R().
		SetSuccessResult(&result).
		SetErrorResult(&result).
		Get(NodesPrefix + "/" + url.PathEscape(name))
	if err != nil {
		return nil, &NetworkError{Cause: err}
	}
	if err := errorFromResponse(resp, result.Code, result.Message); err != nil {
		return nil, err
	}
	return &result.Data, nil
}

func (c *Client) ToggleNodeSchedule(name, reason string) (string, error) {
	return c.nodeMessage("PUT", NodesPrefix+"/"+url.PathEscape(name), NodeScheduleRequest{Reason: reason})
}

func (c *Client) GetNodeMark(name string) (*NodeMark, error) {
	var result Response[NodeMark]
	resp, err := c.httpClient.R().
		SetSuccessResult(&result).
		SetErrorResult(&result).
		Get(AdminNodesPrefix + "/" + url.PathEscape(name) + "/mark")
	if err != nil {
		return nil, &NetworkError{Cause: err}
	}
	if err := errorFromResponse(resp, result.Code, result.Message); err != nil {
		return nil, err
	}
	return &result.Data, nil
}

func (c *Client) AddNodeLabel(name string, req NodeLabel) (string, error) {
	return c.nodeMessage("POST", AdminNodesPrefix+"/"+url.PathEscape(name)+"/label", req)
}

func (c *Client) DeleteNodeLabel(name string, req NodeLabel) (string, error) {
	return c.nodeMessage("DELETE", AdminNodesPrefix+"/"+url.PathEscape(name)+"/label", req)
}

func (c *Client) AddNodeAnnotation(name string, req NodeAnnotation) (string, error) {
	return c.nodeMessage("POST", AdminNodesPrefix+"/"+url.PathEscape(name)+"/annotation", req)
}

func (c *Client) DeleteNodeAnnotation(name string, req NodeAnnotation) (string, error) {
	return c.nodeMessage("DELETE", AdminNodesPrefix+"/"+url.PathEscape(name)+"/annotation", req)
}

func (c *Client) AddNodeTaint(name string, req NodeTaint) (string, error) {
	return c.nodeMessage("POST", AdminNodesPrefix+"/"+url.PathEscape(name)+"/taint", req)
}

func (c *Client) DeleteNodeTaint(name string, req NodeTaint) (string, error) {
	return c.nodeMessage("DELETE", AdminNodesPrefix+"/"+url.PathEscape(name)+"/taint", req)
}

func (c *Client) DrainNode(name string) (string, error) {
	return c.nodeMessage("POST", AdminNodesPrefix+"/"+url.PathEscape(name)+"/drain", nil)
}

func (c *Client) nodeMessage(method, path string, body interface{}) (string, error) {
	var result Response[string]
	req := c.httpClient.R().
		SetSuccessResult(&result).
		SetErrorResult(&result)
	if body != nil {
		req.SetBody(body)
	}
	var resp responseStatus
	var err error
	switch method {
	case "POST":
		resp, err = req.Post(path)
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
