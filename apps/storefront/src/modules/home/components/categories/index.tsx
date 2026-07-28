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
    <div className="bg-[#F5F5F7] py-16 small:py-24 border-y border-[#CFCFD4]/40">
      <div className="content-container">
        <div className="flex flex-col items-center mb-12">
          <span className="text-[#E53946] text-xs uppercase tracking-widest font-semibold mb-2">
            Kategori Terpopuler
          </span>
          <Heading
            level="h2"
            className="text-3xl small:text-4xl text-[#1E1F74] font-bold text-center"
          >
            Jelajahi Kategori
          </Heading>
          <Text className="text-[#3A1E65]/80 mt-3 text-center max-w-lg">
            Temukan produk yang tepat untuk Anda berdasarkan kategori favorit
          </Text>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 small:gap-6">
          {topLevelCategories.slice(0, 8).map((category) => (
            <LocalizedClientLink
              key={category.id}
              href={`/categories/${category.handle}`}
              className="group relative block aspect-[3/4] overflow-hidden rounded-xl shadow-md transition-shadow duration-300 hover:shadow-xl"
            >
              <img
                src={getCategoryImage(category.handle)}
                alt={category.name}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1E1F74]/90 via-[#3A1E65]/50 to-transparent group-hover:from-[#1E1F74]/95 group-hover:via-[#582158]/70 transition-all duration-300" />
              <div className="absolute inset-0 flex flex-col items-center justify-end p-6 text-center">
                <Heading
                  level="h3"
                  className="text-white text-lg small:text-xl font-bold tracking-tight"
                >
                  {category.name}
                </Heading>
                <span className="text-[#E53946] group-hover:text-white text-xs font-semibold mt-2 inline-flex items-center gap-1 transition-colors duration-300 bg-white/10 group-hover:bg-[#E53946] px-3 py-1 rounded-full border border-white/20">
                  Lihat Produk →
                </span>
              </div>
            </LocalizedClientLink>
          ))}
        </div>
      </div>
    </div>
  )
}
