/**
 * Copyright 2025 RAIDS Lab
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { useAtomValue } from 'jotai'
import { ExternalLinkIcon, GithubIcon, GlobeIcon, HistoryIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { GitHubStarCard } from '@/components/layout/github-star-card'
import PageTitle from '@/components/layout/page-title'

import { atomBackendVersion } from '@/utils/store'
import { configUrlWebsiteBaseAtom } from '@/utils/store/config'

import { VersionValue } from './VersionValue'

const GITHUB_URL = 'https://github.com/raids-lab/crater'

export default function VersionPage() {
  const { t } = useTranslation()
  const backendVersion = useAtomValue(atomBackendVersion)
  const website = useAtomValue(configUrlWebsiteBaseAtom)
  const currentYear = new Date().getFullYear()
  const versions = [
    {
      label: t('about.frontendVersion'),
      version: import.meta.env.VITE_APP_VERSION,
      buildType: import.meta.env.VITE_APP_BUILD_TYPE,
      buildTime: import.meta.env.VITE_APP_BUILD_TIME,
      commit: import.meta.env.VITE_APP_COMMIT_SHA,
    },
    {
      label: t('about.backendVersion'),
      version: backendVersion?.appVersion,
      buildType: backendVersion?.buildType,
      buildTime: backendVersion?.buildTime,
      commit: backendVersion?.commitSHA,
    },
  ]

  return (
    <div className="space-y-6">
      <PageTitle title={t('about.title')} description={t('about.description')} />

      <div className="mx-auto w-full max-w-3xl space-y-5 pt-2">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex items-center gap-4 px-5 py-6 sm:gap-5 sm:px-6">
            <img src="/crater.svg" alt="" className="size-14 shrink-0 sm:size-16" />
            <div className="min-w-0 space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight">{t('about.appName')}</h2>
              <p className="text-muted-foreground text-sm">{t('about.appDescription')}</p>
            </div>
          </div>

          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 sm:px-6">
            {versions.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <VersionValue
                  version={item.version}
                  buildType={item.buildType}
                  fallback={t('about.unavailable')}
                />
                {item.buildType && item.buildType !== 'release' && (
                  <Badge variant="secondary" className="text-xs">
                    {t('about.developmentVersion')}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t px-5 py-4 sm:px-6">
            {website && (
              <Button variant="outline" size="sm" asChild>
                <a href={website} target="_blank" rel="noopener noreferrer">
                  <GlobeIcon aria-hidden="true" />
                  {t('about.website')}
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noopener noreferrer">
                <HistoryIcon aria-hidden="true" />
                {t('about.releaseNotes')}
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <GithubIcon aria-hidden="true" />
                {t('about.sourceCode')}
              </a>
            </Button>
          </div>

          <GitHubStarCard />
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5 sm:px-6">
            <CardTitle className="text-sm font-medium">{t('about.buildInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 px-5 sm:grid-cols-2 sm:px-6">
            {versions.map((item) => {
              const buildTime = item.buildTime ? new Date(item.buildTime) : undefined
              const commit = /^[0-9a-f]{7,40}$/i.test(item.commit ?? '') ? item.commit : undefined

              return (
                <div key={item.label} className="min-w-0 space-y-3">
                  <h3 className="text-sm font-medium">{item.label}</h3>
                  <dl className="space-y-2 text-xs">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <dt className="text-muted-foreground">{t('about.buildTime')}</dt>
                      <dd className="font-mono">
                        {buildTime && !Number.isNaN(buildTime.getTime())
                          ? buildTime.toLocaleString(undefined, {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : t('about.unavailable')}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('about.commit')}</dt>
                      <dd>
                        {commit ? (
                          <a
                            href={`${GITHUB_URL}/commit/${commit}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm font-mono outline-none focus-visible:ring-2"
                          >
                            {commit.substring(0, 7)}
                            <ExternalLinkIcon className="size-3" aria-hidden="true" />
                          </a>
                        ) : (
                          t('about.unavailable')
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <p className="text-muted-foreground text-center text-xs leading-relaxed">
          {t('about.copyright', { year: currentYear })}
        </p>
      </div>
    </div>
  )
}
