import { apiClient, apiV1Delete, apiV1Get, apiV1Post } from '@/services/client'

import { IResponse } from '../types'

export interface KthenaWorkerReq {
  image: string
  replicas?: number
  pods?: number
  cpu?: string
  memory?: string
  gpu?: string
  gpuModel?: string
  config?: Record<string, string>
}

export interface CreateKthenaReq {
  name: string
  modelSource?: 'platform' | 'external'
  platformModelId?: number
  modelURI?: string
  servedModel?: string
  backendType?: string
  cacheURI?: string
  minReplicas?: number
  maxReplicas?: number
  env?: Record<string, string>
  worker: KthenaWorkerReq
  selectors?: Array<{
    key: string
    operator: string
    values?: string[]
  }>
}

export interface KthenaService {
  name: string
  namespace: string
  modelSource: 'platform' | 'external'
  platformModelId: number
  modelURI: string
  servedModel: string
  backendType: string
  cacheURI: string
  minReplicas: number
  maxReplicas: number
  workerImage: string
  workerReplicas: number
  workerCPU: string
  workerMemory: string
  workerGPU: string
  workerGPUModel: string
  env: Record<string, string>
  workerConfig: Record<string, string>
  phase: string
  conditions: Array<Record<string, unknown>>
  resources: KthenaResource[]
  runtimePods?: KthenaRuntimePod[]
  diagnostics?: KthenaDiagnostic[]
  access: KthenaAccess
  labels: Record<string, string>
  createdAt: string
}

export interface KthenaResource {
  kind: string
  name: string
  namespace: string
  phase: string
  ready: boolean
  conditions: Array<Record<string, unknown>>
}

export interface KthenaRuntimePod {
  name: string
  namespace: string
  nodeName: string
  podIP?: string
  hostIP?: string
  phase: string
  ready: boolean
  restarts: number
  readyContainers: number
  totalContainers: number
}

export interface KthenaAccess {
  modelName: string
  proxyBaseURL: string
  internalBaseURL: string
  nodePortURL?: string
  routerService: string
  routeName?: string
  serverName?: string
}

export interface KthenaDiagnostic {
  level: 'warning' | 'error' | string
  reason: string
  message: string
  details?: string
  resource?: string
  pod?: string
  container?: string
  timestamp?: string
}

export interface ChatCompletionReq {
  model?: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

export interface ChatCompletionResp {
  id?: string
  object?: string
  created?: number
  model?: string
  choices?: Array<{
    index?: number
    message?: {
      role?: string
      content?: string
    }
    text?: string
    finish_reason?: string
  }>
  usage?: Record<string, number>
  [key: string]: unknown
}

export const apiCreateKthenaService = (data: CreateKthenaReq) =>
  apiV1Post<IResponse<KthenaService>>('kthena/inference-services', data)

export const apiListKthenaServices = () =>
  apiV1Get<IResponse<KthenaService[]>>('kthena/inference-services')

export const apiGetKthenaService = (name: string) =>
  apiV1Get<IResponse<KthenaService>>(`kthena/inference-services/${name}`)

export const apiDeleteKthenaService = (name: string) =>
  apiV1Delete<IResponse<string>>(`kthena/inference-services/${name}`)

export const apiChatKthenaService = (name: string, data: ChatCompletionReq) =>
  apiClient
    .post(`v1/kthena/inference-services/${name}/openai/v1/chat/completions`, { json: data })
    .json<ChatCompletionResp>()
