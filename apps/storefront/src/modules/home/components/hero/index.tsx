"use client"

import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useParams } from "next/navigation"
import { getDictionary } from "@lib/i18n"

const Hero = () => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).hero

  return (
    <div className="relative flex min-h-[42rem] w-full flex-col overflow-hidden">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-surface-inverse/95 via-surface-inverse-raised/80 to-brand-berry/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-1 items-center py-16">
        <div className="content-container flex flex-col gap-6 max-w-2xl">
          <span className="w-fit rounded-full border border-accent-decorative bg-surface-inverse/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-content-inverse backdrop-blur-sm">
            {t.badge}
          </span>
          <Heading
            level="h1"
            className="text-4xl small:text-6xl leading-tight text-content-inverse font-bold"
          >
            {t.title1}{" "}
            <span className="text-accent-on-inverse">{t.title2}</span>
          </Heading>
          <Text className="text-content-inverse text-lg max-w-md font-normal leading-relaxed">
            {t.description}
          </Text>
          <div className="mt-4 flex w-full flex-col gap-3 xsmall:w-auto xsmall:flex-row xsmall:gap-4">
            <LocalizedClientLink
              href="/store"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-action-primary px-6 py-3 font-semibold text-content-inverse shadow-lg shadow-brand-berry/30 motion-safe:transition-[background-color,box-shadow,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse motion-safe:active:scale-[0.96] xsmall:w-fit"
            >
              {t.shopNow}
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/collections"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-content-inverse/50 bg-surface-inverse/70 px-4 font-medium text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse motion-safe:active:scale-[0.96] xsmall:w-fit"
            >
              {t.exploreCollection}
            </LocalizedClientLink>
          </div>
        </div>
      </div>

      {/* Bottom decorative bar */}
      <div className="relative z-10 border-t border-surface-inverse-raised bg-surface-inverse/90 backdrop-blur-md">
        <div className="content-container py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-center text-xs font-medium uppercase tracking-wider text-content-inverse-muted small:grid-cols-4">
            <span>{t.freeShipping}</span>
            <span>{t.guarantee}</span>
            <span>{t.cod}</span>
            <span>{t.support}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero
