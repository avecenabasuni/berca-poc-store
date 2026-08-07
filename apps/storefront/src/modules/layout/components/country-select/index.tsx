"use client"

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react"
import { Fragment, useEffect, useMemo, useState } from "react"
import ReactCountryFlag from "react-country-flag"

import { useParams, usePathname } from "next/navigation"
import { updateRegion } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { getDictionary } from "@lib/i18n"
import { clx } from "@modules/common/components/ui"

type CountryOption = {
  country: string
  region: string
  label: string
}

type CountrySelectProps = {
  regions: HttpTypes.StoreRegion[]
}

const CountrySelect = ({ regions }: CountrySelectProps) => {
  const [current, setCurrent] = useState<CountryOption | undefined>(undefined)

  const { countryCode } = useParams()
  const t = getDictionary(countryCode)
  const currentPath = usePathname().split(`/${countryCode}`)[1]

  const options = useMemo(() => {
    return regions
      ?.map((r) => {
        return r.countries?.map((c) => ({
          country: c.iso_2 ?? "",
          region: r.id,
          label: c.display_name ?? "",
        }))
      })
      .flat()
      .filter((o): o is CountryOption => !!o)
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [regions])

  useEffect(() => {
    if (countryCode) {
      const option = options?.find((o) => o?.country === countryCode)
      setCurrent(option)
    }
  }, [options, countryCode])

  const handleChange = (option: CountryOption) => {
    updateRegion(option.country, currentPath)
  }

  return (
    <div>
      <Listbox
        onChange={handleChange}
        value={current}
      >
        {({ open }) => (
          <>
            <ListboxButton className="flex min-h-11 w-full items-center rounded-sm px-2 py-1 text-left motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-safe:ease-out hover:bg-content-inverse/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse">
              <span className="txt-compact-small flex flex-wrap items-center gap-x-2">
                <span>{t.nav.shippingTo}</span>
                {current && (
                  <span className="txt-compact-small flex items-center gap-x-2">
                    <ReactCountryFlag
                      svg
                      aria-hidden="true"
                      style={{ width: "16px", height: "16px" }}
                      countryCode={current.country ?? ""}
                    />
                    {current.label}
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
                  {options?.map((o) => (
                    <ListboxOption
                      key={`${o.region}-${o.country}`}
                      value={o}
                      className={({ focus, selected }) =>
                        clx(
                          "flex min-h-11 cursor-pointer items-center gap-x-2 px-3 py-2 motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-safe:ease-out",
                          focus && "bg-surface-subtle outline-none",
                          selected && "font-semibold text-content-primary"
                        )
                      }
                    >
                      <ReactCountryFlag
                        svg
                        aria-hidden="true"
                        style={{ width: "16px", height: "16px" }}
                        countryCode={o.country ?? ""}
                      />
                      {o.label}
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

export default CountrySelect
