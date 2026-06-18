package api

// HTTP path 常量集中维护，业务方法禁止手写 "/api/..." 片段。

const (
	AuthPrefix            = "/api/auth"
	NodesPrefix           = "/api/v1/nodes"
	AdminNodesPrefix      = "/api/v1/admin/nodes"
	NamespacesPrefix      = "/api/v1/namespaces"
	AdminNamespacesPrefix = "/api/v1/admin/namespaces"
)

// AuthLoginPath 为登录接口路径（含模块前缀）。
const AuthLoginPath = AuthPrefix + "/login"
