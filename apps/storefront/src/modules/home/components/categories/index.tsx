import { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const categoryImages: Record<string, string> = {
  shirts:
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80",
  sweatshirts:
    "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&q=80",
  pants:
    "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&q=80",
  shorts:
    "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=600&q=80",
  accessories:
    "https://images.unsplash.com/photo-1523173077343-ce354eef2507?w=600&q=80",
}

function getCategoryImage(handle: string): string {
  if (categoryImages[handle]) {
    return categoryImages[handle]
  }
  return "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80"
}

export default function CategoryGrid({
  categories,
}: {
  categories: HttpTypes.StoreProductCategory[]
}) {
  // Filter to top-level categories only (no parent)
  const topLevelCategories = categories.filter((c) => !c.parent_category)

  if (!topLevelCategories.length) {
    return null
  }

  return (
    <div className="content-container py-12 small:py-24">
      <div className="flex flex-col items-center mb-12">
        <Heading
          level="h2"
          className="text-3xl small:text-4xl text-ui-fg-base font-semibold text-center"
        >
          Jelajahi Kategori
        </Heading>
        <Text className="text-ui-fg-subtle mt-3 text-center max-w-lg">
          Temukan produk yang tepat untuk Anda berdasarkan kategori favorit
        </Text>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 small:gap-6">
        {topLevelCategories.slice(0, 8).map((category) => (
          <LocalizedClientLink
            key={category.id}
            href={`/categories/${category.handle}`}
            className="group relative block aspect-[3/4] overflow-hidden rounded-lg"
          >
            <img
              src={getCategoryImage(category.handle)}
              alt={category.name}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors duration-300" />
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
              <Heading
                level="h3"
                className="text-white text-lg small:text-xl font-semibold text-center"
              >
                {category.name}
              </Heading>
              <Text className="text-white/80 text-sm mt-1">Lihat Produk →</Text>
            </div>
          </LocalizedClientLink>
        ))}
      </div>
    </div>
  )
}
