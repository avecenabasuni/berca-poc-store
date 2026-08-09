"use client"

import * as Accordion from "@radix-ui/react-accordion"
import { useEffect, useState } from "react"

import { ChevronDownMini } from "@medusajs/icons"
import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import clsx from "clsx"
import { getDictionary } from "@lib/i18n"
import { useParams } from "next/navigation"

type OptionsPickerProps = {
  selectedValueIds: string[]
  setOptionValueIds: (valueIds: string[]) => void
}

const OptionsPicker = ({
  selectedValueIds,
  setOptionValueIds,
}: OptionsPickerProps) => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode)
  const [options, setOptions] = useState<HttpTypes.StoreProductOption[]>([])
  const [openItems, setOpenItems] = useState<string[]>([])

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const response = await sdk.client.fetch<{
          product_options?: HttpTypes.StoreProductOption[]
        }>("/store/product-options", {
          method: "GET",
          query: {
            is_exclusive: false,
            fields: "*values",
          },
        })

        if (response?.product_options) {
          setOptions(response.product_options)
        }
      } catch (error) {
        console.error("Failed to fetch product options", error)
      }
    }

    fetchOptions()
  }, [])

  useEffect(() => {
    if (options.length) {
      setOpenItems(options.map((option) => option.id))
    }
  }, [options])

  if (!options.length) {
    return null
  }

  return (
    <div className="border-t border-line-subtle/60 pt-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-content-primary">
          {t.store.options}
        </span>
      </div>
      <Accordion.Root
        type="multiple"
        value={openItems}
        onValueChange={(values) => setOpenItems(values as string[])}
        className="mt-4 flex flex-col gap-2"
      >
        {options.map((option) => {
          const values =
            option.values
              ?.map((value) => ({
                id: value.id,
                label: value.value,
              }))
              .filter(
                (value): value is { id: string; label: string } =>
                  !!value.id && !!value.label,
              ) || []

          if (!values.length) {
            return null
          }

          const toggleValue = (valueId: string) => {
            const isSelected = selectedValueIds.includes(valueId)
            const nextSelections = isSelected
              ? selectedValueIds.filter((id) => id !== valueId)
              : [...selectedValueIds, valueId]

            setOptionValueIds(Array.from(new Set(nextSelections)))
          }

          const isOpen = openItems.includes(option.id)
          const selectedCount = values.filter((value) =>
            selectedValueIds.includes(value.id),
          ).length

          return (
            <Accordion.Item
              key={option.id}
              value={option.id}
              className="border-b border-line-subtle/60 last:border-b-0"
            >
              <Accordion.Header>
                <Accordion.Trigger className="flex min-h-11 w-full items-center justify-between rounded-lg px-1 py-2 text-left text-sm font-medium text-content-primary motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  <div className="flex items-center gap-2">
                    <span>{option.title || t.store.options}</span>
                    <span className="text-xs tabular-nums text-content-muted">
                      ({selectedCount})
                    </span>
                  </div>
                  <span
                    className={clsx(
                      "flex h-8 w-8 items-center justify-center text-content-muted motion-safe:transition-transform motion-safe:duration-150",
                      {
                        "rotate-180": isOpen,
                      },
                    )}
                  >
                    <ChevronDownMini aria-hidden="true" />
                  </span>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pb-4 pt-2">
                <div className="flex flex-wrap gap-2">
                  {values.map((value) => {
                    const isSelected = selectedValueIds.includes(value.id)

                    return (
                      <button
                        key={value.id}
                        onClick={() => toggleValue(value.id)}
                        className={clsx(
                          "flex min-h-11 items-center rounded-lg border border-line-control px-3 text-sm text-content-secondary motion-safe:transition-[background-color,border-color,color,scale] motion-safe:duration-150 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]",
                          {
                            "border-action-primary bg-surface-subtle font-semibold text-content-primary":
                              isSelected,
                            "hover:text-content-primary": !isSelected,
                          },
                        )}
                        aria-pressed={isSelected}
                      >
                        {isSelected && (
                          <span className="sr-only">{t.product.selected} </span>
                        )}
                        {value.label}
                      </button>
                    )
                  })}
                </div>
              </Accordion.Content>
            </Accordion.Item>
          )
        })}
      </Accordion.Root>
    </div>
  )
}

export default OptionsPicker
