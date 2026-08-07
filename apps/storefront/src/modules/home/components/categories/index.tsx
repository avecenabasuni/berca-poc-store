import { HttpTypes } from "@medusajs/types"
import { ArrowRight } from "@medusajs/icons"
import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Image from "next/image"

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
    <section id="categories" className="scroll-mt-28 border-y border-line-subtle/40 bg-surface-subtle py-16 small:py-24">
      <div className="content-container">
        <div className="flex flex-col items-center mb-12">
          <span className="text-content-interactive text-xs uppercase tracking-widest font-semibold mb-2">
            Kategori Terpopuler
          </span>
          <Heading
            level="h2"
            className="text-3xl small:text-4xl text-content-primary font-bold text-center"
          >
            Jelajahi Kategori
          </Heading>
          <Text className="text-content-secondary mt-3 text-center max-w-lg">
            Temukan produk yang tepat untuk Anda berdasarkan kategori favorit
          </Text>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 small:gap-6">
          {topLevelCategories.slice(0, 8).map((category) => (
            <LocalizedClientLink
              key={category.id}
              href={`/categories/${category.handle}`}
              className="surface-elevated-interactive group relative block aspect-[3/4] overflow-hidden rounded-xl motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
            >
              <Image
                src={getCategoryImage(category.handle)}
                alt={category.name}
                fill
                quality={80}
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-inverse/90 via-surface-inverse-raised/50 to-transparent group-hover:from-surface-inverse/95 group-hover:via-brand-purple/70" />
              <div className="absolute inset-0 flex flex-col items-center justify-end p-6 text-center">
                <Heading
                  level="h3"
                  className="text-content-inverse text-lg small:text-xl font-bold tracking-tight"
                >
                  {category.name}
                </Heading>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-content-inverse/30 bg-surface-inverse/80 px-3 py-1 text-xs font-semibold text-content-inverse motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-safe:ease-out group-hover:bg-action-primary">
                  Lihat Produk
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </LocalizedClientLink>
          ))}
        </div>
      </div>
    </section>
  )
}
