import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { t } from 'i18next'
import {
  BracesIcon,
  CirclePlusIcon,
  CpuIcon,
  GaugeIcon,
  HardDriveIcon,
  RocketIcon,
  Settings2Icon,
  Trash2Icon,
  VariableIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import Combobox, { ComboboxItem } from '@/components/form/combobox'
import { EnvFormCard } from '@/components/form/env-form-field'
import FormLabelMust from '@/components/form/form-label-must'
import { ImageFormField } from '@/components/form/image-form-field'
import { ResourceFormFields } from '@/components/form/resource-form-field'
import CardTitle from '@/components/label/card-title'
import PageTitle from '@/components/layout/page-title'

import { apiGetNodes } from '@/services/api/cluster'
import { IDataset, apiGetDataset } from '@/services/api/dataset'
import { apiCreateKthenaService, apiGetKthenaService } from '@/services/api/inference'
import { JobType } from '@/services/api/vcjob'

import {
  buildNodeSelectors,
  defaultResource,
  envsSchema,
  nodeSelectorSchema,
  resourceSchema,
} from '@/utils/form'
import { showErrorToast } from '@/utils/toast'

export const Route = createFileRoute('/portal/inference-services/new')({
  validateSearch: (search: Record<string, unknown>) => ({
    clone: typeof search.clone === 'string' ? search.clone : undefined,
  }),
  component: NewKthenaServicePage,
  loader: () => ({ crumb: t('kthena.form.title') }),
})

const configItemsSchema = z.array(
  z.object({
    key: z.string().min(1, t('kthena.form.validation.configKeyRequired')),
    value: z.string(),
  })
)

const formSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, t('kthena.form.validation.namePattern')),
  modelSource: z.enum(['platform', 'external']).default('platform'),
  platformModelId: z.coerce.number().int().nonnegative().optional(),
  modelURI: z.string().optional(),
  servedModel: z.string().optional(),
  backendType: z.string().default('vLLM'),
  cacheURI: z.string().default('hostpath:///tmp/cache'),
  minReplicas: z.coerce.number().int().min(1).default(1),
  maxReplicas: z.coerce.number().int().min(1).default(1),
  imageSource: z.enum(['platform', 'manual']).default('manual'),
  image: z.string().optional(),
  platformImage: z
    .object({
      imageLink: z.string().optional(),
      archs: z.array(z.string()).default([]),
    })
    .optional(),
  resource: resourceSchema,
  envs: envsSchema,
  configItems: configItemsSchema,
  nodeSelector: nodeSelectorSchema,
})

type FormSchema = z.input<typeof formSchema>
type ParsedFormSchema = z.output<typeof formSchema>

type DeploymentPreset = {
  key: string
  title: string
  description: string
  icon: typeof CpuIcon
  values: Partial<FormSchema>
}

const deploymentPresets: DeploymentPreset[] = [
  {
    key: 'cpu-vllm',
    title: t('kthena.form.preset.cpu.title'),
    description: t('kthena.form.preset.cpu.description'),
    icon: CpuIcon,
    values: {
      modelSource: 'external',
      modelURI: 'hf://Qwen/Qwen2.5-0.5B-Instruct',
      servedModel: 'Qwen2.5-0.5B-Instruct',
      backendType: 'vLLM',
      imageSource: 'manual',
      image: 'public.ecr.aws/q9t5s3a7/vllm-cpu-release-repo:latest',
      resource: { ...defaultResource, cpu: 2, memory: 4 },
      minReplicas: 1,
      maxReplicas: 1,
      envs: [{ name: 'HF_ENDPOINT', value: 'https://hf-mirror.com' }],
      configItems: [
        { key: 'max-model-len', value: '32768' },
        { key: 'max-num-batched-tokens', value: '65536' },
        { key: 'block-size', value: '128' },
      ],
    },
  },
  {
    key: 'gpu-vllm',
    title: 'GPU vLLM',
    description: t('kthena.form.preset.gpu.description'),
    icon: GaugeIcon,
    values: {
      modelSource: 'external',
      modelURI: 'hf://Qwen/Qwen3-8B',
      servedModel: 'Qwen3-8B',
      backendType: 'vLLM',
      imageSource: 'manual',
      image: 'ghcr.io/volcano-sh/vllm-openai:v0.10.0-cu128-nixl-v0.4.1-lmcache-0.3.2',
      resource: {
        ...defaultResource,
        cpu: 4,
        memory: 16,
        gpu: { count: 1, model: 'nvidia.com/gpu' },
      },
      minReplicas: 1,
      maxReplicas: 1,
      envs: [
        { name: 'HF_ENDPOINT', value: 'https://hf-mirror.com' },
        { name: 'NCCL_IB_DISABLE', value: '0' },
      ],
      configItems: [
        { key: 'max-model-len', value: '32768' },
        { key: 'max-num-batched-tokens', value: '65536' },
        { key: 'tensor-parallel-size', value: '1' },
      ],
    },
  },
  {
    key: 'sglang',
    title: t('kthena.form.preset.sglang.title'),
    description: t('kthena.form.preset.sglang.description'),
    icon: RocketIcon,
    values: {
      modelSource: 'external',
      modelURI: 'hf://Qwen/Qwen2.5-7B-Instruct',
      servedModel: 'Qwen2.5-7B-Instruct',
      backendType: 'SGLang',
      imageSource: 'manual',
      image: 'lmsysorg/sglang:latest',
      resource: {
        ...defaultResource,
        cpu: 4,
        memory: 16,
        gpu: { count: 1, model: 'nvidia.com/gpu' },
      },
      minReplicas: 1,
      maxReplicas: 1,
      envs: [{ name: 'HF_ENDPOINT', value: 'https://hf-mirror.com' }],
      configItems: [{ key: 'context-length', value: '32768' }],
    },
  },
]

const runtimeImages: Record<string, string> = {
  vLLM: 'ghcr.io/volcano-sh/vllm-openai:v0.10.0-cu128-nixl-v0.4.1-lmcache-0.3.2',
  SGLang: 'lmsysorg/sglang:latest',
  MindIE: 'swr.cn-south-1.myhuaweicloud.com/ascendhub/mindie:latest',
  vLLMDisaggregated: 'ghcr.io/volcano-sh/vllm-openai:v0.10.0-cu128-nixl-v0.4.1-lmcache-0.3.2',
}

const runtimeDescriptionKeys: Record<string, string> = {
  vLLM: 'kthena.form.runtime.vllm',
  SGLang: 'kthena.form.runtime.sglang',
  MindIE: 'kthena.form.runtime.mindie',
  vLLMDisaggregated: 'kthena.form.runtime.disaggregated',
}

const parseMemoryGi = (value: string) => {
  const trimmed = value.trim()
  if (trimmed.endsWith('Gi')) {
    return parseInt(trimmed.slice(0, -2), 10) || 4
  }
  if (trimmed.endsWith('Mi')) {
    return Math.max(1, Math.ceil((parseInt(trimmed.slice(0, -2), 10) || 1024) / 1024))
  }
  return parseInt(trimmed, 10) || 4
}

const mapToItems = (value?: Record<string, string>) =>
  Object.entries(value ?? {}).map(([name, envValue]) => ({ name, value: envValue }))

const mapToConfigItems = (value?: Record<string, string>) =>
  Object.entries(value ?? {}).map(([key, configValue]) => ({ key, value: configValue }))

function NewKthenaServicePage() {
  const { t } = useTranslation()
  const navigate = Route.useNavigate()
  const { clone } = Route.useSearch()
  const queryClient = useQueryClient()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [envOpen, setEnvOpen] = useState(false)
  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      modelSource: 'platform',
      platformModelId: undefined,
      modelURI: '',
      servedModel: '',
      backendType: 'vLLM',
      cacheURI: 'hostpath:///tmp/cache',
      minReplicas: 1,
      maxReplicas: 1,
      imageSource: 'manual',
      image: 'public.ecr.aws/q9t5s3a7/vllm-cpu-release-repo:latest',
      platformImage: {
        imageLink: '',
        archs: [],
      },
      resource: { ...defaultResource, cpu: 2, memory: 4 },
      envs: [{ name: 'HF_ENDPOINT', value: 'https://hf-mirror.com' }],
      configItems: [
        { key: 'max-model-len', value: '32768' },
        { key: 'max-num-batched-tokens', value: '65536' },
        { key: 'block-size', value: '128' },
      ],
      nodeSelector: {
        enable: false,
        nodeName: '',
        excludedNodes: [],
      },
    },
  })
  const modelSource = form.watch('modelSource')
  const platformModelId = form.watch('platformModelId')
  const imageSource = form.watch('imageSource')
  const gpuCount = form.watch('resource.gpu.count')
  const nodeSelectorEnabled = form.watch('nodeSelector.enable')
  const {
    fields: configFields,
    append: appendConfig,
    remove: removeConfig,
  } = useFieldArray({
    control: form.control,
    name: 'configItems',
  })

  const { data: modelItems = [] } = useQuery({
    queryKey: ['dataset', 'my-models'],
    queryFn: () => apiGetDataset(),
    select: (res) =>
      res.data
        .filter((item) => item.type === 'model')
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (item) =>
            ({
              value: String(item.id),
              label: item.name,
              selectedLabel: item.name,
              tags: item.extra?.tag ?? [],
              detail: item,
            }) as ComboboxItem<IDataset>
        ),
  })

  const selectedModel = useMemo(
    () => modelItems.find((item) => item.value === String(platformModelId))?.detail,
    [modelItems, platformModelId]
  )
  const { data: nodeItems = [] } = useQuery({
    queryKey: ['cluster', 'nodes', 'brief'],
    queryFn: () => apiGetNodes(),
    select: (res) =>
      res.data
        .map(
          (node) =>
            ({
              value: node.name,
              label: node.name,
            }) as ComboboxItem<{ name: string }>
        )
        .sort((a, b) => a.label.localeCompare(b.label)),
  })
  const { data: cloneSource } = useQuery({
    queryKey: ['kthena/inference-services', clone],
    queryFn: () => apiGetKthenaService(clone ?? '').then((res) => res.data),
    enabled: !!clone,
  })

  useEffect(() => {
    if (!cloneSource) return
    const resource = {
      ...defaultResource,
      cpu: parseInt(cloneSource.workerCPU || '2', 10) || 2,
      memory: parseMemoryGi(cloneSource.workerMemory || '4Gi'),
      gpu: {
        count: parseInt(cloneSource.workerGPU || '0', 10) || 0,
        model: cloneSource.workerGPUModel || undefined,
      },
    }
    form.reset({
      name: `${cloneSource.name}-copy`.slice(0, 63),
      modelSource: cloneSource.modelSource || 'external',
      platformModelId: cloneSource.platformModelId || undefined,
      modelURI: cloneSource.modelSource === 'external' ? cloneSource.modelURI : '',
      servedModel: cloneSource.servedModel,
      backendType: cloneSource.backendType || 'vLLM',
      cacheURI: cloneSource.cacheURI || 'hostpath:///tmp/cache',
      minReplicas: cloneSource.minReplicas || 1,
      maxReplicas: cloneSource.maxReplicas || 1,
      imageSource: 'manual',
      image: cloneSource.workerImage,
      platformImage: {
        imageLink: '',
        archs: [],
      },
      resource,
      envs: mapToItems(cloneSource.env),
      configItems: mapToConfigItems(cloneSource.workerConfig),
      nodeSelector: {
        enable: false,
        nodeName: '',
        excludedNodes: [],
      },
    })
    setAdvancedOpen(true)
    setEnvOpen(Object.keys(cloneSource.env ?? {}).length > 0)
  }, [cloneSource, form])

  const { mutate: createService, isPending } = useMutation({
    mutationFn: (values: ParsedFormSchema) =>
      apiCreateKthenaService({
        name: values.name,
        modelSource: values.modelSource,
        platformModelId: values.modelSource === 'platform' ? values.platformModelId : undefined,
        modelURI: values.modelSource === 'external' ? values.modelURI : undefined,
        servedModel: values.servedModel,
        backendType: values.backendType,
        cacheURI: values.cacheURI,
        minReplicas: values.minReplicas,
        maxReplicas: values.maxReplicas,
        env: Object.fromEntries(values.envs.map((item) => [item.name, item.value])),
        worker: {
          image:
            values.imageSource === 'platform'
              ? (values.platformImage?.imageLink ?? '')
              : (values.image ?? ''),
          replicas: 1,
          pods: 1,
          cpu: String(values.resource.cpu),
          memory: `${values.resource.memory}Gi`,
          gpu: String(values.resource.gpu.count),
          gpuModel: values.resource.gpu.model,
          config: Object.fromEntries(values.configItems.map((item) => [item.key, item.value])),
        },
        selectors: buildNodeSelectors(values.nodeSelector),
      }),
    onSuccess: async (_, values) => {
      await queryClient.invalidateQueries({ queryKey: ['kthena/inference-services'] })
      toast.success(t('kthena.form.createSuccess', { name: values.name }))
      navigate({ to: '/portal/inference-services' })
    },
    onError: showErrorToast,
  })

  const onSubmit = (values: FormSchema) => {
    const parsed = formSchema.parse(values)
    if (parsed.modelSource === 'platform' && !parsed.platformModelId) {
      form.setError('platformModelId', {
        message: t('kthena.form.validation.platformModelRequired'),
      })
      return
    }
    if (parsed.modelSource === 'external' && !parsed.modelURI) {
      form.setError('modelURI', { message: t('kthena.form.validation.modelURIRequired') })
      return
    }
    if (parsed.imageSource === 'platform' && !parsed.platformImage?.imageLink) {
      form.setError('platformImage', { message: t('kthena.form.validation.platformImageRequired') })
      return
    }
    if (parsed.imageSource === 'manual' && !parsed.image) {
      form.setError('image', { message: t('kthena.form.validation.imageRequired') })
      return
    }
    if (parsed.maxReplicas < parsed.minReplicas) {
      form.setError('maxReplicas', { message: t('kthena.form.validation.maxReplicas') })
      return
    }
    createService(parsed)
  }

  const applyPreset = (preset: DeploymentPreset) => {
    Object.entries(preset.values).forEach(([key, value]) => {
      form.setValue(key as keyof FormSchema, value as never, {
        shouldDirty: true,
        shouldValidate: true,
      })
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid flex-1 items-start gap-4 md:gap-x-6 lg:grid-cols-3"
      >
        <PageTitle
          title={t('kthena.form.title')}
          description={
            clone
              ? t('kthena.form.cloneDescription', { name: clone })
              : t('kthena.form.description')
          }
          className="lg:col-span-3"
        >
          <Button type="submit" disabled={isPending}>
            <RocketIcon className="size-4" />
            {isPending ? t('kthena.actions.requesting') : t('kthena.form.submit')}
          </Button>
        </PageTitle>

        <div className="flex flex-col gap-4 md:gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle icon={RocketIcon}>{t('kthena.form.sections.presets')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {deploymentPresets.map((preset) => {
                const Icon = preset.icon
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="hover:border-primary/60 hover:bg-muted/40 flex min-h-32 flex-col rounded-md border p-4 text-left transition-colors"
                  >
                    <Icon className="text-primary mb-3 size-5" />
                    <span className="font-medium">{preset.title}</span>
                    <span className="text-muted-foreground mt-2 text-sm leading-5">
                      {preset.description}
                    </span>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle icon={HardDriveIcon}>{t('kthena.form.sections.modelSource')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('kthena.form.fields.serviceName')}
                      <FormLabelMust />
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="qwen-demo" />
                    </FormControl>
                    <FormDescription>{t('kthena.form.descriptions.serviceName')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="modelSource"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('kthena.form.fields.source')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="platform">{t('kthena.form.source.platform')}</SelectItem>
                        <SelectItem value="external">{t('kthena.form.source.external')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>{t('kthena.form.descriptions.source')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {modelSource === 'platform' ? (
                <FormField
                  control={form.control}
                  name="platformModelId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('kthena.form.fields.platformModel')}
                        <FormLabelMust />
                      </FormLabel>
                      <FormControl>
                        <Combobox
                          items={modelItems}
                          current={field.value ? String(field.value) : ''}
                          handleSelect={(value) => {
                            const id = Number(value)
                            field.onChange(id)
                            const model = modelItems.find((item) => item.value === value)?.detail
                            if (model) {
                              form.setValue('servedModel', model.name, { shouldDirty: true })
                            }
                          }}
                          renderLabel={(item) => (
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate">{item.label}</span>
                              <span className="text-muted-foreground truncate text-xs">
                                {item.detail?.url}
                              </span>
                            </div>
                          )}
                          formTitle={t('kthena.form.selectPlatformModel')}
                        />
                      </FormControl>
                      <FormDescription>
                        {selectedModel
                          ? t('kthena.form.descriptions.selectedModel', { url: selectedModel.url })
                          : t('kthena.form.descriptions.platformModel')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="modelURI"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('kthena.form.fields.modelURI')}
                        <FormLabelMust />
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="font-mono"
                          placeholder="hf://Qwen/Qwen2.5-0.5B-Instruct"
                        />
                      </FormControl>
                      <FormDescription>{t('kthena.form.descriptions.modelURI')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="servedModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('kthena.form.fields.servedModel')}</FormLabel>
                    <FormControl>
                      <Input {...field} className="font-mono" />
                    </FormControl>
                    <FormDescription>{t('kthena.form.descriptions.servedModel')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle icon={RocketIcon}>{t('kthena.form.sections.runtime')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <FormField
                control={form.control}
                name="backendType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('kthena.form.fields.backend')}</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value)
                        const image = runtimeImages[value]
                        if (image) {
                          form.setValue('imageSource', 'manual', {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                          form.setValue('image', image, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="vLLM">vLLM</SelectItem>
                        <SelectItem value="SGLang">SGLang</SelectItem>
                        <SelectItem value="MindIE">MindIE</SelectItem>
                        <SelectItem value="vLLMDisaggregated">vLLMDisaggregated</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t(
                        runtimeDescriptionKeys[field.value ?? ''] ?? 'kthena.form.runtime.default'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="imageSource"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('kthena.form.fields.imageSource')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="platform">
                          {t('kthena.form.imageSource.platform')}
                        </SelectItem>
                        <SelectItem value="manual">
                          {t('kthena.form.imageSource.manual')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>{t('kthena.form.descriptions.imageSource')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {imageSource === 'platform' ? (
                <ImageFormField
                  form={form}
                  name="platformImage"
                  jobType={JobType.Custom}
                  label={t('kthena.form.fields.workerImage')}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="image"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('kthena.form.fields.workerImage')}
                        <FormLabelMust />
                      </FormLabel>
                      <FormControl>
                        <Input {...field} className="font-mono" />
                      </FormControl>
                      <FormDescription>{t('kthena.form.descriptions.workerImage')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle icon={Settings2Icon}>{t('kthena.form.sections.resources')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <ResourceFormFields
                form={form}
                cpuPath="resource.cpu"
                memoryPath="resource.memory"
                gpuCountPath="resource.gpu.count"
                gpuModelPath="resource.gpu.model"
              />
              {gpuCount > 0 && (
                <div className="text-muted-foreground rounded-md border p-3 text-sm">
                  {t('kthena.form.descriptions.gpuModel')}
                </div>
              )}
              <div className="grid gap-5 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="minReplicas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('kthena.form.fields.minReplicas')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={1} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxReplicas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('kthena.form.fields.maxReplicas')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={1} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle icon={Settings2Icon}>{t('kthena.form.sections.scheduling')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField
                control={form.control}
                name="nodeSelector.enable"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <FormLabel>{t('kthena.form.fields.pinNode')}</FormLabel>
                      <FormDescription>{t('kthena.form.descriptions.pinNode')}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              {nodeSelectorEnabled && (
                <FormField
                  control={form.control}
                  name="nodeSelector.nodeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('kthena.form.fields.node')}
                        <FormLabelMust />
                      </FormLabel>
                      <FormControl>
                        <Combobox
                          items={nodeItems}
                          current={field.value ?? ''}
                          handleSelect={field.onChange}
                          formTitle={t('kthena.form.selectNode')}
                        />
                      </FormControl>
                      <FormDescription>{t('kthena.form.descriptions.node')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 md:gap-6">
          <EnvFormCard
            form={form}
            open={envOpen}
            setOpen={setEnvOpen}
            cardTitle={t('kthena.form.sections.env')}
          />
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle icon={BracesIcon}>{t('kthena.form.sections.advanced')}</CardTitle>
                <Switch checked={advancedOpen} onCheckedChange={setAdvancedOpen} />
              </div>
            </CardHeader>
            <CardContent className={advancedOpen ? 'grid gap-4' : 'hidden'}>
              {modelSource === 'external' && (
                <FormField
                  control={form.control}
                  name="cacheURI"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('kthena.form.fields.cacheURI')}</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-mono" />
                      </FormControl>
                      <FormDescription>{t('kthena.form.descriptions.cacheURI')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="grid gap-3">
                {configFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid items-start gap-2 md:grid-cols-[1fr_1fr_auto]"
                  >
                    <FormField
                      control={form.control}
                      name={`configItems.${index}.key`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel hidden={index > 0}>
                            {t('kthena.form.fields.configKey')}
                          </FormLabel>
                          <FormControl>
                            <Input {...field} className="font-mono" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`configItems.${index}.value`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel hidden={index > 0}>
                            {t('kthena.form.fields.configValue')}
                          </FormLabel>
                          <FormControl>
                            <Input {...field} className="font-mono" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={index > 0 ? '' : 'md:mt-6'}
                      onClick={() => removeConfig(index)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => appendConfig({ key: '', value: '' })}
                >
                  <CirclePlusIcon className="size-4" />
                  {t('kthena.form.actions.addConfig')}
                </Button>
              </div>
              <FormDescription>{t('kthena.form.descriptions.workerConfig')}</FormDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle icon={VariableIcon}>{t('kthena.form.sections.guide')}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-3 text-sm leading-6">
              <p>{t('kthena.form.guide.model')}</p>
              <p>{t('kthena.form.guide.resources')}</p>
              <p>{t('kthena.form.guide.env')}</p>
              <p>{t('kthena.form.guide.advanced')}</p>
              <p>{t('kthena.form.guide.cache')}</p>
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  )
}
