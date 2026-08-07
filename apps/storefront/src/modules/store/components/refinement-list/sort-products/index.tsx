"use client"

import FilterRadioGroup from "@modules/common/components/filter-radio-group"
import { getDictionary } from "@lib/i18n"
import { useParams } from "next/navigation"

export type SortOptions = "price_asc" | "price_desc" | "created_at"

type SortProductsProps = {
  sortBy: SortOptions
  setQueryParams: (name: string, value: string) => void
  "data-testid"?: string
}

const SortProducts = ({
  "data-testid": dataTestId,
  sortBy,
  setQueryParams,
}: SortProductsProps) => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).store
  const sortOptions = [
    { value: "created_at", label: t.latest },
    { value: "price_asc", label: t.priceLowHigh },
    { value: "price_desc", label: t.priceHighLow },
  ]

  const handleChange = (value: string) => {
    setQueryParams("sortBy", value as SortOptions)
  }

  return (
    <FilterRadioGroup
      title={t.sortBy}
      items={sortOptions}
      value={sortBy}
      handleChange={handleChange}
      data-testid={dataTestId}
    />
  )
}

export default SortProducts
