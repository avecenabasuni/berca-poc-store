import { Metadata } from "next"

import FeaturedProducts from "@modules/home/components/featured-products"
import CategoryGrid from "@modules/home/components/categories"
import Hero from "@modules/home/components/hero"
import { listCollections } from "@lib/data/collections"
import { listCategories } from "@lib/data/categories"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: "Berca Store — Belanja Lebih Mudah, Lebih Cepat",
  description:
    "Temukan berbagai pilihan produk berkualitas dengan harga terbaik di Berca Store. Pengiriman cepat ke seluruh Indonesia.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  const { collections } = await listCollections({
    fields: "id, handle, title",
  })

  const productCategories = await listCategories()

  if (!collections || !region) {
    return null
  }

  return (
    <>
      <Hero />
      <div className="py-12">
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>
      {productCategories && productCategories.length > 0 && (
        <CategoryGrid categories={productCategories} />
      )}
    </>
  )
}
