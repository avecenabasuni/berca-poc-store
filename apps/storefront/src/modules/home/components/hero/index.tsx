"use client"

import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Image from "next/image"
import { useParams } from "next/navigation"
import { getDictionary } from "@lib/i18n"

const Hero = () => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).hero

  return (
    <section className="relative flex min-h-[36rem] w-full overflow-hidden small:min-h-[38rem]">
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80"
          alt=""
          aria-hidden="true"
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-surface-inverse via-surface-inverse/85 to-brand-berry/60" />
      </div>

      <div className="relative z-10 flex w-full items-center">
        <div className="content-container py-20 small:py-28">
          <div className="flex max-w-2xl flex-col gap-6">
            <span className="w-fit rounded-full border border-accent-on-inverse/40 bg-surface-inverse/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-content-inverse backdrop-blur-sm">
              {t.badge}
            </span>
            <Heading
              level="h1"
              className="text-4xl font-bold leading-tight text-content-inverse xsmall:text-5xl small:text-6xl"
            >
              {t.title1}{" "}
              <span className="text-accent-on-inverse">{t.title2}</span>
            </Heading>
            <Text className="max-w-xl text-pretty text-lg leading-relaxed text-content-inverse">
              {t.description}
            </Text>
            <div className="mt-2 flex w-full flex-col gap-3 xsmall:w-auto xsmall:flex-row xsmall:gap-4">
              <LocalizedClientLink
                href="/store"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-action-primary px-6 font-semibold text-content-inverse shadow-lg shadow-brand-berry/30 motion-safe:transition-[background-color,box-shadow,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse motion-safe:active:scale-[0.96] xsmall:w-fit"
              >
                {t.shopNow}
              </LocalizedClientLink>
              <a
                href="#categories"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-content-inverse/40 bg-surface-inverse/50 px-5 font-medium text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse motion-safe:active:scale-[0.96] xsmall:w-fit"
              >
                {t.exploreCategories}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
