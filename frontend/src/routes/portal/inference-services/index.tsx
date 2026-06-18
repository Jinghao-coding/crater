import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns'
import { t } from 'i18next'
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  BoxesIcon,
  CheckCircle2Icon,
  CopyIcon,
  EllipsisVerticalIcon,
  LoaderCircleIcon,
  type LucideIcon,
  RocketIcon,
  Trash2Icon,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import KthenaStatusBadge, { getKthenaDisplayState } from '@/components/badge/kthena-status-badge'
import ResourceBadges from '@/components/badge/resource-badges'
import TooltipCopy from '@/components/label/tooltop-copy'
import PageTitle from '@/components/layout/page-title'

import {
  KthenaService,
  apiDeleteKthenaService,
  apiListKthenaServices,
} from '@/services/api/inference'

import { showErrorToast } from '@/utils/toast'

import { REFETCH_INTERVAL } from '@/lib/constants'

export const Route = createFileRoute('/portal/inference-services/')({
  component: KthenaServicesPage,
  loader: () => ({ crumb: t('kthena.title') }),
})

function KthenaServicesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [phaseFilter, setPhaseFilter] = useState<'all' | 'running' | 'progressing' | 'attention'>(
    'all'
  )
  const [serviceToDelete, setServiceToDelete] = useState<KthenaService | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['kthena/inference-services'],
    queryFn: () => apiListKthenaServices().then((res) => res.data),
    refetchInterval: REFETCH_INTERVAL,
  })
  const services = useMemo(() => data ?? [], [data])
  const runningCount = services.filter(
    (service) => getKthenaDisplayState(service) === 'running'
  ).length
  const attentionCount = services.filter((service) =>
    ['degraded', 'failed'].includes(getKthenaDisplayState(service))
  ).length
  const progressingCount = services.length - runningCount - attentionCount
  const filteredServices = useMemo(() => {
    if (phaseFilter === 'running') {
      return services.filter((service) => getKthenaDisplayState(service) === 'running')
    }
    if (phaseFilter === 'progressing') {
      return services.filter(
        (service) => !['running', 'degraded', 'failed'].includes(getKthenaDisplayState(service))
      )
    }
    if (phaseFilter === 'attention') {
      return services.filter((service) =>
        ['degraded', 'failed'].includes(getKthenaDisplayState(service))
      )
    }
    return services
  }, [phaseFilter, services])

  const { mutate: deleteService, isPending } = useMutation({
    mutationFn: apiDeleteKthenaService,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['kthena/inference-services'] })
      setServiceToDelete(null)
      toast.success(t('kthena.delete.success'))
    },
    onError: showErrorToast,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={t('kthena.title')} description={t('kthena.list.description')}>
        <Button asChild>
          <Link to="/portal/inference-services/new" search={{ clone: undefined }}>
            <RocketIcon className="size-4" />
            {t('kthena.actions.create')}
          </Link>
        </Button>
      </PageTitle>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          icon={BoxesIcon}
          label={t('kthena.summary.total')}
          value={services.length.toString()}
          tone="default"
        />
        <SummaryCard
          icon={CheckCircle2Icon}
          label={t('kthena.summary.running')}
          value={runningCount.toString()}
          tone="success"
        />
        <SummaryCard
          icon={LoaderCircleIcon}
          label={t('kthena.summary.progressing')}
          value={progressingCount.toString()}
          tone="warning"
        />
        <SummaryCard
          icon={AlertTriangleIcon}
          label={t('kthena.summary.attention')}
          value={attentionCount.toString()}
          tone="danger"
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-muted-foreground text-sm">
              {isLoading
                ? t('kthena.list.syncing')
                : t('kthena.list.showing', { count: filteredServices.length })}
            </div>
            <div className="flex rounded-md border p-0.5">
              <FilterButton active={phaseFilter === 'all'} onClick={() => setPhaseFilter('all')}>
                {t('kthena.filter.all')}
              </FilterButton>
              <FilterButton
                active={phaseFilter === 'running'}
                onClick={() => setPhaseFilter('running')}
              >
                {t('kthena.filter.running')}
              </FilterButton>
              <FilterButton
                active={phaseFilter === 'progressing'}
                onClick={() => setPhaseFilter('progressing')}
              >
                {t('kthena.filter.progressing')}
              </FilterButton>
              <FilterButton
                active={phaseFilter === 'attention'}
                onClick={() => setPhaseFilter('attention')}
              >
                {t('kthena.filter.attention')}
              </FilterButton>
            </div>
          </div>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[18%]">{t('kthena.table.name')}</TableHead>
                  <TableHead className="w-[20%]">{t('kthena.table.model')}</TableHead>
                  <TableHead className="w-[10%]">{t('kthena.table.backend')}</TableHead>
                  <TableHead className="w-[10%]">{t('kthena.table.replicas')}</TableHead>
                  <TableHead className="w-[14%]">{t('kthena.detail.runtimeResources')}</TableHead>
                  <TableHead>{t('kthena.table.image')}</TableHead>
                  <TableHead className="w-[10%]">{t('kthena.table.status')}</TableHead>
                  <TableHead className="w-[12%]">{t('kthena.table.createdAt')}</TableHead>
                  <TableHead className="w-20 text-right">{t('kthena.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                      {t('kthena.loading')}
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filteredServices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                      {t('kthena.empty')}
                    </TableCell>
                  </TableRow>
                )}
                {filteredServices.map((service) => (
                  <KthenaServiceRow
                    key={service.name}
                    service={service}
                    deleting={isPending}
                    onDelete={() => setServiceToDelete(service)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <AlertDialog
        open={serviceToDelete !== null}
        onOpenChange={(open) => !open && setServiceToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('kthena.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('kthena.delete.description', { name: serviceToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('kthena.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending || serviceToDelete === null}
              onClick={() => serviceToDelete && deleteService(serviceToDelete.name)}
            >
              {t('kthena.actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: string
  tone: 'default' | 'success' | 'warning' | 'danger'
}) {
  const iconClass =
    tone === 'success'
      ? 'bg-emerald-500/10 text-emerald-600'
      : tone === 'danger'
        ? 'bg-rose-500/10 text-rose-600'
        : tone === 'warning'
          ? 'bg-amber-500/10 text-amber-600'
          : 'bg-muted text-muted-foreground'
  return (
    <Card>
      <CardContent className="flex min-h-24 items-center justify-between p-4">
        <div>
          <div className="text-muted-foreground text-sm">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <div className={`flex size-9 items-center justify-center rounded-md ${iconClass}`}>
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  )
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={[
        'h-8 rounded-sm px-3 text-sm transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
      ].join(' ')}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function KthenaServiceRow({
  service,
  deleting,
  onDelete,
}: {
  service: KthenaService
  deleting: boolean
  onDelete: (name: string) => void
}) {
  const { t } = useTranslation()
  return (
    <TableRow className="h-14">
      <TableCell>
        <div className="flex min-w-0 flex-col">
          <Link
            to="/portal/inference-services/$name"
            params={{ name: service.name }}
            className="hover:text-primary truncate font-medium"
          >
            {service.name}
          </Link>
          <span className="text-muted-foreground truncate text-xs">{service.namespace}</span>
        </div>
      </TableCell>
      <TableCell>
        <TooltipCopy
          name={service.servedModel || service.modelURI}
          copyMessage={t('kthena.copy.model')}
          className="max-w-72 truncate font-mono text-xs"
        />
      </TableCell>
      <TableCell className="font-mono text-xs">{service.backendType}</TableCell>
      <TableCell className="font-mono text-xs">
        {service.minReplicas}-{service.maxReplicas}
      </TableCell>
      <TableCell>
        <WorkerResourceBadges service={service} />
      </TableCell>
      <TableCell>
        <TooltipCopy
          name={service.workerImage}
          copyMessage={t('kthena.copy.image')}
          className="max-w-64 truncate font-mono text-xs"
        />
      </TableCell>
      <TableCell>
        <KthenaStatusBadge service={service} />
      </TableCell>
      <TableCell>
        {service.createdAt
          ? formatDistanceToNow(new Date(service.createdAt), { addSuffix: true })
          : '-'}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={deleting}
              title={t('kthena.actions.more')}
            >
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              {service.name}
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/portal/inference-services/$name" params={{ name: service.name }}>
                <ArrowUpRightIcon className="size-4" />
                {t('kthena.actions.view')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/portal/inference-services/new" search={{ clone: service.name }}>
                <CopyIcon className="size-4" />
                {t('kthena.actions.clone')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(service.name)}>
              <Trash2Icon className="size-4" />
              {t('kthena.actions.deleteDeployment')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

function WorkerResourceBadges({ service }: { service: KthenaService }) {
  const resources = getWorkerResources(service)
  if (Object.keys(resources).length === 0) {
    return <span className="text-muted-foreground text-xs">-</span>
  }
  return <ResourceBadges resources={resources} />
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
