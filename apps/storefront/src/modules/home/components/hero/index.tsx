"use client"

import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useParams } from "next/navigation"
import { getDictionary } from "@lib/i18n"

const Hero = () => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).hero

  return (
    <div className="relative h-[85vh] w-full overflow-hidden">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1E1F74]/95 via-[#3A1E65]/80 to-[#782046]/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full items-center">
        <div className="content-container flex flex-col gap-6 max-w-2xl">
          <span className="text-[#E53946] bg-[#E53946]/10 backdrop-blur-sm border border-[#E53946]/30 uppercase tracking-widest text-xs font-semibold px-3 py-1.5 rounded-full w-fit">
            {t.badge}
          </span>
          <Heading
            level="h1"
            className="text-4xl small:text-6xl leading-tight text-white font-bold"
          >
            {t.title1}{" "}
            <span className="text-[#E53946]">{t.title2}</span>
          </Heading>
          <Text className="text-[#F5F5F7]/90 text-lg max-w-md font-normal leading-relaxed">
            {t.description}
          </Text>
          <div className="flex gap-4 mt-4">
            <LocalizedClientLink
              href="/store"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-[#E53946] px-6 py-3 font-semibold text-white shadow-lg shadow-[#E53946]/30 hover:bg-[#9F2335] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {t.shopNow}
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/collections"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-white/30 bg-white/10 px-4 font-medium text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {t.exploreCollection}
            </LocalizedClientLink>
          </div>
        </div>
      </div>

      {/* Bottom decorative bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-[#1E1F74]/90 backdrop-blur-md border-t border-[#3A1E65]">
        <div className="content-container py-3">
          <div className="flex items-center justify-between text-[#F5F5F7]/80 text-xs uppercase tracking-wider font-medium">
            <span>{t.freeShipping}</span>
            <span className="hidden small:inline text-[#782046]">|</span>
            <span>{t.guarantee}</span>
            <span className="hidden small:inline text-[#782046]">|</span>
            <span>{t.cod}</span>
            <span className="hidden small:inline text-[#782046]">|</span>
            <span className="hidden small:inline">{t.support}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero
