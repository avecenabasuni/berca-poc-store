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

const categoryLabels: Record<string, string> = {
  shirts: "Kemeja & kaus",
  sweatshirts: "Sweatshirt",
  pants: "Celana",
  shorts: "Celana pendek",
  accessories: "Aksesori",
  merch: "Koleksi Berca",
}

function getCategoryImage(handle: string): string {
  if (categoryImages[handle]) {
    return categoryImages[handle]
  }
  return "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80"
}

function getCategoryLabel(handle: string, fallback: string): string {
  return categoryLabels[handle] ?? fallback
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
    <section
      id="categories"
      className="scroll-mt-28 bg-surface-subtle py-16 small:py-20"
    >
      <div className="content-container">
        <div className="mb-10 flex max-w-2xl flex-col items-start small:mb-12">
          <span className="mb-3 text-xs font-semibold uppercase tracking-widest text-content-interactive">
            Kategori Terpopuler
          </span>
          <Heading
            level="h2"
            className="text-3xl font-bold text-content-primary small:text-4xl"
          >
            Jelajahi Kategori
          </Heading>
          <Text className="mt-3 max-w-lg text-content-secondary">
            Temukan produk yang tepat untuk Anda berdasarkan kategori favorit
          </Text>
        </div>
        <div className="grid grid-cols-2 gap-4 small:gap-6 lg:grid-cols-4">
          {topLevelCategories.slice(0, 8).map((category) => {
            const label = getCategoryLabel(category.handle, category.name)

            return (
              <LocalizedClientLink
                key={category.id}
                href={`/categories/${category.handle}`}
                aria-label={`Lihat kategori ${label}`}
                className="surface-elevated-interactive group relative block aspect-[4/5] overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
              >
                <Image
                  src={getCategoryImage(category.handle)}
                  alt=""
                  fill
                  quality={80}
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-inverse via-surface-inverse/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 text-content-inverse small:p-6">
                  <Heading
                    level="h3"
                    className="text-lg font-bold tracking-tight small:text-xl"
                  >
                    {label}
                  </Heading>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-content-inverse/30 bg-surface-inverse/70 motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out group-hover:translate-x-0.5 group-hover:bg-action-primary">
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
              </LocalizedClientLink>
            )
          })}
        </div>
      </div>
    </section>
  )
}
