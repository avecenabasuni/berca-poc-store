import { Suspense } from "react"

import { OptionValueIds } from "@lib/util/product-option-filters"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getDictionary } from "@lib/i18n"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
  optionValueIds,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"
  const t = getDictionary(countryCode).store

  return (
    <div
      className="content-container flex flex-col py-10 small:py-14 small:flex-row small:items-start small:gap-x-8"
      data-testid="category-container"
    >
      <RefinementList sortBy={sort} />
      <div className="w-full">
        <div className="mb-8 small:mb-10">
          <span className="text-xs font-semibold uppercase tracking-widest text-content-interactive">
            {t.eyebrow}
          </span>
          <h1
            className="mt-3 text-balance text-3xl font-bold leading-tight tracking-tight text-content-primary small:text-4xl"
            data-testid="store-page-title"
          >
            {t.allProducts}
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-content-secondary">
            {t.description}
          </p>
        </div>
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            countryCode={countryCode}
            optionValueIds={optionValueIds}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default StoreTemplate
