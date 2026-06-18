import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  BracesIcon,
  CheckCircle2Icon,
  CopyIcon,
  CpuIcon,
  EraserIcon,
  MessageSquareIcon,
  NetworkIcon,
  PlayIcon,
  ServerIcon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react'
import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import KthenaStatusBadge, {
  getKthenaDisplayState,
  getKthenaStatusLabel,
} from '@/components/badge/kthena-status-badge'
import ResourceBadges from '@/components/badge/resource-badges'
import CardTitle from '@/components/label/card-title'
import TooltipCopy from '@/components/label/tooltop-copy'
import PageTitle from '@/components/layout/page-title'
import NotFound from '@/components/placeholder/not-found'

import {
  ChatCompletionReq,
  ChatCompletionResp,
  KthenaDiagnostic,
  KthenaResource,
  KthenaRuntimePod,
  KthenaService,
  apiChatKthenaService,
  apiDeleteKthenaService,
  apiGetKthenaService,
} from '@/services/api/inference'

import { showErrorToast } from '@/utils/toast'

import { REFETCH_INTERVAL } from '@/lib/constants'

export const Route = createFileRoute('/portal/inference-services/$name')({
  component: KthenaServiceDetailPage,
  errorComponent: () => <NotFound />,
  loader: ({ params }) => ({ crumb: params.name }),
})

const getResourcePhaseVariant = (
  phase: string
): 'default' | 'secondary' | 'outline' | 'destructive' => {
  if (phase === 'Ready' || phase === 'Active') return 'default'
  if (phase === 'Failed') return 'destructive'
  if (phase === 'Pending' || phase === 'Progressing') return 'secondary'
  return 'outline'
}

type ChatMessage = ChatCompletionReq['messages'][number]

const getChatStorageKey = (serviceName: string) => `kthena-chat-history:${serviceName}`

function KthenaServiceDetailPage() {
  const { t } = useTranslation()
  const navigate = Route.useNavigate()
  const { name } = Route.useParams()
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [prompt, setPrompt] = useState(t('kthena.detail.defaultPrompt'))
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredMessages(name))
  const [rawResponse, setRawResponse] = useState<ChatCompletionResp | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['kthena/inference-services', name],
    queryFn: () => apiGetKthenaService(name).then((res) => res.data),
    refetchInterval: REFETCH_INTERVAL,
  })

  const service = data
  const curl = useMemo(
    () => (service ? buildCurl(service, messages, prompt) : ''),
    [service, messages, prompt]
  )
  const displayState = service ? getKthenaDisplayState(service) : 'submitted'
  const stateMeta = getKthenaStatusLabel(displayState)
  const pendingMessages = useMemo(
    () =>
      prompt.trim()
        ? [...messages, { role: 'user', content: prompt.trim() } satisfies ChatMessage]
        : messages,
    [messages, prompt]
  )

  useEffect(() => {
    setMessages(readStoredMessages(name))
    setRawResponse(null)
  }, [name])

  useEffect(() => {
    if (messages.length === 0) {
      window.localStorage.removeItem(getChatStorageKey(name))
      return
    }
    window.localStorage.setItem(getChatStorageKey(name), JSON.stringify(messages))
  }, [messages, name])

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: (nextMessages: ChatMessage[]) =>
      apiChatKthenaService(name, {
        model: service?.access?.modelName || service?.name,
        messages: nextMessages,
        temperature: 0.2,
        stream: false,
      }),
    onSuccess: (resp, nextMessages) => {
      const assistantAnswer = extractAnswer(resp)
      setMessages(
        assistantAnswer
          ? [...nextMessages, { role: 'assistant', content: assistantAnswer }]
          : nextMessages
      )
      setPrompt('')
      setRawResponse(resp)
    },
    onError: showErrorToast,
  })
  const { mutate: deleteService, isPending: isDeleting } = useMutation({
    mutationFn: apiDeleteKthenaService,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['kthena/inference-services'] })
      toast.success(t('kthena.delete.success'))
      navigate({ to: '/portal/inference-services' })
    },
    onError: showErrorToast,
  })

  if (isLoading || !service) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle title={t('kthena.detail.title')} description={t('kthena.list.syncing')}>
          <Button variant="outline" asChild>
            <Link to="/portal/inference-services">
              <ArrowLeftIcon className="size-4" />
              {t('kthena.actions.back')}
            </Link>
          </Button>
        </PageTitle>
        <Card>
          <CardContent className="text-muted-foreground flex h-40 items-center justify-center">
            {t('kthena.loading')}
          </CardContent>
        </Card>
      </div>
    )
  }

  const workerResources = getWorkerResources(service)
  const primaryPod = service.runtimePods?.find((pod) => pod.ready) ?? service.runtimePods?.[0]

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={service.name} description={t('kthena.detail.description')}>
        <Button variant="outline" asChild>
          <Link to="/portal/inference-services/new" search={{ clone: service.name }}>
            <CopyIcon className="size-4" />
            {t('kthena.actions.clone')}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/portal/inference-services">
            <ArrowLeftIcon className="size-4" />
            {t('kthena.actions.backToList')}
          </Link>
        </Button>
        <Button variant="destructive" disabled={isDeleting} onClick={() => setDeleteOpen(true)}>
          <Trash2Icon className="size-4" />
          {t('kthena.actions.delete')}
        </Button>
      </PageTitle>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          icon={ActivityIcon}
          label={t('kthena.table.status')}
          value={stateMeta?.label ?? service.phase}
        >
          <KthenaStatusBadge service={service} />
        </MetricCard>
        <MetricCard
          icon={ServerIcon}
          label={t('kthena.table.backend')}
          value={service.backendType || '-'}
        />
        <MetricCard
          icon={CheckCircle2Icon}
          label={t('kthena.detail.servedModel')}
          value={service.servedModel || '-'}
          mono
        />
        <MetricCard
          icon={CpuIcon}
          label={t('kthena.detail.runtimeResources')}
          value={formatResourceSummary(workerResources)}
        >
          <ResourceBadges resources={workerResources} />
        </MetricCard>
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="overview">
            <NetworkIcon className="size-4" />
            {t('kthena.detail.tabs.overview')}
          </TabsTrigger>
          <TabsTrigger value="resources">
            <BracesIcon className="size-4" />
            {t('kthena.detail.tabs.resources')}
          </TabsTrigger>
          <TabsTrigger value="diagnostics">
            <AlertTriangleIcon className="size-4" />
            {t('kthena.detail.tabs.diagnostics')}
          </TabsTrigger>
          <TabsTrigger value="invoke">
            <MessageSquareIcon className="size-4" />
            {t('kthena.detail.tabs.invoke')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle icon={NetworkIcon}>{t('kthena.detail.overviewTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <InfoGrid
                rows={[
                  {
                    label: t('kthena.detail.apiBase'),
                    content: <CopyValue value={displayAPIBaseURL(service)} />,
                  },
                  {
                    label: t('kthena.detail.routeModelName'),
                    content: <CopyValue value={service.access?.modelName || service.name} />,
                  },
                  {
                    label: t('kthena.detail.servedModel'),
                    content: <CopyValue value={service.servedModel || '-'} />,
                  },
                  {
                    label: t('kthena.detail.routeResource'),
                    content: (
                      <CopyValue
                        value={service.access?.routeName || t('kthena.detail.waitingModelRoute')}
                      />
                    ),
                  },
                  {
                    label: 'Router',
                    content: <CopyValue value={service.access?.routerService || '-'} />,
                  },
                ]}
              />
              <RuntimePanel service={service} primaryPod={primaryPod} resources={workerResources} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle icon={BracesIcon}>{t('kthena.detail.tabs.resources')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {service.resources?.length ? (
                service.resources.map((resource) => (
                  <ResourceCard key={`${resource.kind}/${resource.name}`} resource={resource} />
                ))
              ) : (
                <div className="text-muted-foreground text-sm">
                  {t('kthena.detail.noResources')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle icon={AlertTriangleIcon}>{t('kthena.detail.diagnosticsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {service.diagnostics?.length ? (
                <>
                  <DiagnosticSummary diagnostics={service.diagnostics} />
                  <div className="before:bg-border relative grid gap-3 pl-5 before:absolute before:top-1 before:bottom-1 before:left-2 before:w-px">
                    {service.diagnostics.map((diagnostic, index) => (
                      <DiagnosticCard
                        key={`${diagnostic.resource}-${diagnostic.reason}-${index}`}
                        diagnostic={diagnostic}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground text-sm">
                  {t('kthena.detail.noDiagnostics')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoke" className="mt-0">
          <div className="grid h-[calc(100vh-18rem)] min-h-[560px] gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <Card className="min-h-0">
              <CardHeader>
                <CardTitle icon={MessageSquareIcon}>{t('kthena.detail.onlineTest')}</CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="bg-muted/40 flex min-h-0 flex-1 flex-col gap-3 overflow-auto rounded-md border p-3">
                  {messages.length ? (
                    messages.map((message, index) => (
                      <ChatBubble key={`${message.role}-${index}`} message={message} />
                    ))
                  ) : (
                    <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                      {t('kthena.detail.responsePlaceholder')}
                    </div>
                  )}
                  {isPending && (
                    <ChatBubble
                      message={{ role: 'assistant', content: t('kthena.actions.requesting') }}
                      muted
                    />
                  )}
                </div>
                <div className="grid gap-2">
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="min-h-24 resize-none"
                    placeholder={t('kthena.detail.promptPlaceholder')}
                  />
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button
                      variant="outline"
                      disabled={isPending || messages.length === 0}
                      onClick={() => {
                        setMessages([])
                        setRawResponse(null)
                        window.localStorage.removeItem(getChatStorageKey(name))
                      }}
                    >
                      <EraserIcon className="size-4" />
                      {t('kthena.actions.clearChat')}
                    </Button>
                    <Button
                      disabled={isPending || !prompt.trim()}
                      onClick={() => sendMessage(pendingMessages)}
                    >
                      <PlayIcon className="size-4" />
                      {isPending ? t('kthena.actions.requesting') : t('kthena.actions.send')}
                    </Button>
                  </div>
                </div>
                {rawResponse && (
                  <details className="text-muted-foreground text-xs">
                    <summary className="cursor-pointer">{t('kthena.detail.rawResponse')}</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-md border p-3">
                      {JSON.stringify(rawResponse, null, 2)}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>

            <Card className="min-h-0">
              <CardHeader>
                <CardTitle icon={TerminalIcon}>{t('kthena.detail.invokeInfo')}</CardTitle>
              </CardHeader>
              <CardContent className="grid min-h-0 gap-3">
                <InfoGrid
                  rows={[
                    {
                      label: 'Crater API',
                      content: <CopyValue value={displayAPIBaseURL(service)} />,
                    },
                    {
                      label: t('kthena.detail.routeModelName'),
                      content: <CopyValue value={service.access?.modelName || service.name} />,
                    },
                  ]}
                />
                <div className="min-w-0 rounded-md border p-3">
                  <div className="text-muted-foreground mb-2 text-xs">curl</div>
                  <pre className="bg-muted text-muted-foreground max-h-56 overflow-auto rounded-md p-3 text-xs leading-5 break-all whitespace-pre-wrap">
                    {curl}
                  </pre>
                </div>
                <p className="text-muted-foreground text-xs leading-5">
                  {t('kthena.detail.invokeHint')}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('kthena.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('kthena.delete.description', { name: service.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('kthena.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={() => deleteService(service.name)}
            >
              {t('kthena.actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  mono,
  children,
}: {
  icon: typeof ActivityIcon
  label: string
  value: string
  mono?: boolean
  children?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex min-h-24 items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-muted-foreground text-sm">{label}</div>
          {children ?? (
            <div
              className={[
                'mt-1 truncate text-lg font-semibold',
                mono ? 'font-mono text-sm' : '',
              ].join(' ')}
            >
              {value}
            </div>
          )}
        </div>
        <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
          <Icon className="text-muted-foreground size-4" />
        </div>
      </CardContent>
    </Card>
  )
}

function InfoGrid({
  rows,
}: {
  rows: Array<{
    label: string
    content: ReactNode
  }>
}) {
  return (
    <div className="grid content-start gap-x-4 gap-y-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <div className="text-muted-foreground">{row.label}</div>
          <div className="min-w-0 font-mono">{row.content}</div>
        </Fragment>
      ))}
    </div>
  )
}

function RuntimePanel({
  service,
  primaryPod,
  resources,
}: {
  service: KthenaService
  primaryPod?: KthenaRuntimePod
  resources: Record<string, string>
}) {
  const { t } = useTranslation()
  const pods = service.runtimePods ?? []
  return (
    <div className="grid content-start gap-4">
      <InfoGrid
        rows={[
          {
            label: t('kthena.table.status'),
            content: <KthenaStatusBadge service={service} />,
          },
          {
            label: t('kthena.detail.runtimePod'),
            content: <CopyValue value={primaryPod?.name || '-'} />,
          },
          {
            label: t('kthena.detail.runtimeNode'),
            content: <CopyValue value={primaryPod?.nodeName || '-'} />,
          },
          {
            label: t('kthena.detail.runtimeResources'),
            content: Object.keys(resources).length ? (
              <ResourceBadges resources={resources} />
            ) : (
              <span className="text-muted-foreground font-sans">-</span>
            ),
          },
        ]}
      />
      {pods.length ? (
        <div className="grid gap-2 border-t pt-4">
          {pods.map((pod) => (
            <div
              key={`${pod.namespace}/${pod.name}`}
              className="bg-muted/40 grid gap-2 rounded-md p-3"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <TooltipCopy
                  name={pod.name}
                  copyMessage={t('kthena.copy.generic', { label: 'Pod' })}
                  className="max-w-full min-w-0 truncate font-mono text-xs"
                />
                <Badge variant={pod.ready ? 'default' : 'secondary'}>{pod.phase || '-'}</Badge>
              </div>
              <div className="min-w-0">
                <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                  <span>{pod.nodeName || '-'}</span>
                  {pod.podIP && <span>{pod.podIP}</span>}
                  <span>
                    {pod.readyContainers}/{pod.totalContainers}
                  </span>
                  {pod.restarts > 0 && (
                    <span>{t('kthena.detail.restarts', { count: pod.restarts })}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CopyValue({ value }: { value?: string }) {
  const { t } = useTranslation()
  const display = value || '-'
  return (
    <TooltipCopy
      name={display}
      copyMessage={t('kthena.copy.generic', { label: display })}
      showIcon={display !== '-'}
      className="max-w-full text-left font-mono break-all"
    />
  )
}

function ChatBubble({ message, muted = false }: { message: ChatMessage; muted?: boolean }) {
  const isUser = message.role === 'user'
  const content = isUser ? message.content : stripThinkBlocks(message.content)
  return (
    <div className={['flex', isUser ? 'justify-end' : 'justify-start'].join(' ')}>
      <div
        className={[
          'max-w-[82%] rounded-md px-3 py-2 text-sm leading-6 whitespace-pre-wrap',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-background border',
          muted ? 'text-muted-foreground' : '',
        ].join(' ')}
      >
        {content}
      </div>
    </div>
  )
}

function ResourceCard({ resource }: { resource: KthenaResource }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-medium">{resource.kind}</div>
        <Badge variant={getResourcePhaseVariant(resource.phase)}>
          {resource.phase || 'Pending'}
        </Badge>
      </div>
      <TooltipCopy
        name={`${resource.namespace}/${resource.name}`}
        copyMessage={t('kthena.copy.resource')}
        className="max-w-full truncate font-mono text-xs"
      />
      {resource.conditions?.length > 0 && (
        <div className="text-muted-foreground mt-2 line-clamp-2 text-xs">
          {resource.conditions
            .map((condition) => `${String(condition.type ?? '')}:${String(condition.status ?? '')}`)
            .join(' · ')}
        </div>
      )}
    </div>
  )
}

function DiagnosticCard({ diagnostic }: { diagnostic: KthenaDiagnostic }) {
  const { t } = useTranslation()
  const isError = diagnostic.level === 'error'
  return (
    <div
      className={[
        'relative rounded-md border p-3',
        isError ? 'border-destructive/40 bg-destructive/5' : '',
      ].join(' ')}
    >
      <div
        className={[
          'border-background absolute top-4 -left-[17px] size-2.5 rounded-full border-2',
          isError ? 'bg-destructive' : 'bg-amber-500',
        ].join(' ')}
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant={isError ? 'destructive' : 'secondary'}>
          {diagnostic.reason || diagnostic.level}
        </Badge>
        {diagnostic.pod && <span className="text-muted-foreground text-xs">{diagnostic.pod}</span>}
        {diagnostic.container && (
          <span className="text-muted-foreground text-xs">/{diagnostic.container}</span>
        )}
      </div>
      <div className="text-sm leading-6 break-words">{diagnostic.message}</div>
      {diagnostic.details && (
        <details className="mt-3">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            {t('kthena.detail.logDetails')}
          </summary>
          <pre className="bg-muted mt-2 max-h-72 overflow-auto rounded-md p-3 text-xs leading-5 break-words whitespace-pre-wrap">
            {diagnostic.details}
          </pre>
        </details>
      )}
      {(diagnostic.resource || diagnostic.timestamp) && (
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-xs">
          {diagnostic.resource && <span>{diagnostic.resource}</span>}
          {diagnostic.timestamp && <span>{new Date(diagnostic.timestamp).toLocaleString()}</span>}
        </div>
      )}
    </div>
  )
}

function DiagnosticSummary({ diagnostics }: { diagnostics: KthenaDiagnostic[] }) {
  const { t } = useTranslation()
  const firstError =
    diagnostics.find((diagnostic) => diagnostic.level === 'error') ?? diagnostics[0]
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant={firstError.level === 'error' ? 'destructive' : 'secondary'}>
          {firstError.reason || firstError.level}
        </Badge>
        <span className="text-muted-foreground text-xs">{t('kthena.detail.primaryIssue')}</span>
      </div>
      <div className="text-sm leading-6 break-words">{firstError.message}</div>
    </div>
  )
}

function getWorkerResources(service: KthenaService) {
  const resources: Record<string, string> = {}
  if (service.workerCPU) resources.cpu = service.workerCPU
  if (service.workerMemory) resources.memory = service.workerMemory
  if (service.workerGPU && service.workerGPU !== '0') {
    resources[service.workerGPUModel || 'gpu'] = service.workerGPU
  }
  return resources
}

function formatResourceSummary(resources: Record<string, string>) {
  const values = Object.values(resources)
  return values.length ? values.join(' / ') : '-'
}

function buildCurl(service: KthenaService, messages: ChatMessage[], prompt: string) {
  const model = service.access?.modelName || service.name
  const baseURL = displayAPIBaseURL(service)
  const requestMessages = prompt.trim()
    ? [...messages, { role: 'user', content: prompt.trim() } satisfies ChatMessage]
    : messages
  return `curl -X POST ${baseURL}/chat/completions \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer <your-crater-token>' \\
  -d '${JSON.stringify({
    model,
    messages: requestMessages,
    temperature: 0.2,
  })}'`
}

function displayAPIBaseURL(service: KthenaService) {
  return `${window.location.origin}/api${service.access?.proxyBaseURL || `/v1/kthena/inference-services/${service.name}/openai/v1`}`
}

function extractAnswer(response: ChatCompletionResp) {
  const first = response.choices?.[0]
  return stripThinkBlocks(
    first?.message?.content || first?.text || JSON.stringify(response, null, 2)
  )
}

function stripThinkBlocks(content: string) {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s+/, '')
    .trimEnd()
}

function readStoredMessages(serviceName: string): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(getChatStorageKey(serviceName))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isChatMessage)
  } catch {
    return []
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<ChatMessage>
  return (
    (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  )
}
