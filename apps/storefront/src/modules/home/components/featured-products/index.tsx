import { HttpTypes } from "@medusajs/types"
import ProductRail from "@modules/home/components/featured-products/product-rail"
import { listProducts } from "@lib/data/products"
import ProductPreview from "@modules/products/components/product-preview"
import { Heading, Text } from "@modules/common/components/ui"
import InteractiveLink from "@modules/common/components/interactive-link"

export default async function FeaturedProducts({
  collections,
  region,
}: {
  collections: HttpTypes.StoreCollection[]
  region: HttpTypes.StoreRegion
}) {
  const hasCollections = collections && collections.length > 0

  if (hasCollections) {
    return (
      <>
        {collections.map((collection) => (
          <li key={collection.id}>
            <ProductRail collection={collection} region={region} />
          </li>
        ))}
      </>
    )
  }

  const {
    response: { products },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      limit: 4,
      fields: "*variants.calculated_price",
    },
  })

  if (!products || products.length === 0) {
    return null
  }

  return (
    <div className="content-container py-12 small:py-24">
      <div className="flex flex-col small:flex-row small:items-end justify-between mb-8 gap-4">
        <div>
          <Heading level="h2" className="text-2xl small:text-3xl font-semibold">
            Produk Terbaru
          </Heading>
          <Text className="text-ui-fg-subtle text-sm mt-1">
            Pilihan produk terbaik dan populer di Berca Store
          </Text>
        </div>
        <InteractiveLink href="/store">Lihat Semua Produk</InteractiveLink>
      </div>
      <ul className="grid grid-cols-2 small:grid-cols-4 gap-x-6 gap-y-8">
        {products.map((product) => (
          <li key={product.id}>
            <ProductPreview product={product} region={region} isFeatured />
          </li>
        ))}
      </ul>
    </div>
  )
}
