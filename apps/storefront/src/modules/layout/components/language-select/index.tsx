"use client"

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react"
import { Fragment, useEffect, useMemo, useState, useTransition } from "react"
import { useParams, useRouter } from "next/navigation"
import ReactCountryFlag from "react-country-flag"

import { updateLocale } from "@lib/data/locale-actions"
import { Locale } from "@lib/data/locales"
import { clx } from "@modules/common/components/ui"
import { getDictionary } from "@lib/i18n"

type LanguageOption = {
  code: string
  name: string
  localizedName: string
  countryCode: string
}

const getCountryCodeFromLocale = (localeCode: string): string => {
  try {
    const locale = new Intl.Locale(localeCode)
    if (locale.region) {
      return locale.region.toUpperCase()
    }
    const maximized = locale.maximize()
    return maximized.region?.toUpperCase() ?? localeCode.toUpperCase()
  } catch {
    const parts = localeCode.split(/[-_]/)
    return parts.length > 1 ? parts[1].toUpperCase() : parts[0].toUpperCase()
  }
}

type LanguageSelectProps = {
  locales: Locale[]
  currentLocale: string | null
}

/**
 * Gets the localized display name for a language code using Intl API.
 * Falls back to the provided name if Intl is unavailable.
 */
const getLocalizedLanguageName = (
  code: string,
  fallbackName: string,
  displayLocale: string = "en-US"
): string => {
  try {
    const displayNames = new Intl.DisplayNames([displayLocale], {
      type: "language",
    })
    return displayNames.of(code) ?? fallbackName
  } catch {
    return fallbackName
  }
}

const DEFAULT_OPTION: LanguageOption = {
  code: "",
  name: "Default",
  localizedName: "Default",
  countryCode: "",
}

const LanguageSelect = ({
  locales,
  currentLocale,
}: LanguageSelectProps) => {
  const [current, setCurrent] = useState<LanguageOption | undefined>(undefined)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).nav

  const options = useMemo(() => {
    const localeOptions = locales.map((locale) => ({
      code: locale.code,
      name: locale.name,
      localizedName: getLocalizedLanguageName(
        locale.code,
        locale.name,
        currentLocale ?? "en-US"
      ),
      countryCode: getCountryCodeFromLocale(locale.code),
    }))
    return [DEFAULT_OPTION, ...localeOptions]
  }, [locales, currentLocale])

  useEffect(() => {
    if (currentLocale) {
      const option = options.find(
        (o) => o.code.toLowerCase() === currentLocale.toLowerCase()
      )
      setCurrent(option ?? DEFAULT_OPTION)
    } else {
      setCurrent(DEFAULT_OPTION)
    }
  }, [options, currentLocale])

  const handleChange = (option: LanguageOption) => {
    startTransition(async () => {
      await updateLocale(option.code)
      router.refresh()
    })
  }

  return (
    <div>
      <Listbox
        onChange={handleChange}
        value={current ?? DEFAULT_OPTION}
        disabled={isPending}
      >
        {({ open }) => (
          <>
            <ListboxButton className="flex min-h-11 w-full items-center rounded-sm px-2 py-1 text-left motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-safe:ease-out hover:bg-content-inverse/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse">
              <span className="txt-compact-small flex flex-wrap items-center gap-x-2">
                <span>{t.language}</span>
                {current && (
                  <span className="txt-compact-small flex items-center gap-x-2">
                    {current.countryCode && (
                      <ReactCountryFlag
                        svg
                        aria-hidden="true"
                        style={{ width: "16px", height: "16px" }}
                        countryCode={current.countryCode}
                      />
                    )}
                    {isPending ? t.updating : current.localizedName}
                  </span>
                )}
              </span>
            </ListboxButton>
            <div className="relative flex w-full min-w-0">
              <Transition
                show={open}
                as={Fragment}
                leave="transition ease-out duration-150"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <ListboxOptions className="surface-elevated absolute bottom-11 left-0 z-[900] max-h-[min(442px,60vh)] w-full min-w-0 overflow-y-auto rounded-rounded bg-surface-default text-small-regular uppercase text-content-primary focus:outline-none">
                  {options.map((o) => (
                    <ListboxOption
                      key={o.code || "default"}
                      value={o}
                      className={({ focus, selected }) =>
                        clx(
                          "flex min-h-11 cursor-pointer items-center gap-x-2 px-3 py-2 motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-safe:ease-out",
                          focus && "bg-surface-subtle outline-none",
                          selected && "font-semibold text-content-primary"
                        )
                      }
                    >
                      {o.countryCode ? (
                        <ReactCountryFlag
                          svg
                          aria-hidden="true"
                          style={{ width: "16px", height: "16px" }}
                          countryCode={o.countryCode}
                        />
                      ) : (
                        <span aria-hidden="true" className="h-4 w-4" />
                      )}
                      {o.localizedName}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Transition>
            </div>
          </>
        )}
      </Listbox>
    </div>
  )
}

export default LanguageSelect
