import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import { Text, clx } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { getDictionary } from "@lib/i18n"

export default async function Footer({ countryCode = "id" }: { countryCode?: string }) {
  const t = getDictionary(countryCode).footer
  const { collections } = await listCollections({
    fields: "*products",
  })
  const productCategories = await listCategories()

  return (
    <footer className="w-full border-t border-surface-inverse-raised bg-surface-inverse text-content-inverse">
      <div className="content-container flex flex-col w-full">
        <div className="flex flex-col items-start justify-between gap-y-10 py-16 small:flex-row small:gap-x-12 small:py-20">
          <div className="flex w-full flex-col gap-y-4 small:max-w-sm">
            <LocalizedClientLink
              href="/"
              className="text-2xl font-bold tracking-tight text-content-inverse hover:underline motion-safe:transition-colors uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse"
            >
              <span translate="no">Berca Store</span>
            </LocalizedClientLink>
            <Text className="text-sm leading-relaxed text-content-inverse-muted">
              {t.description}
            </Text>
          </div>
          <div className="grid w-full grid-cols-2 gap-10 text-sm small:flex-1 small:grid-cols-3 small:gap-x-12">
            {productCategories && productCategories?.length > 0 && (
              <div className="flex flex-col gap-y-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-content-inverse">
                  {t.categories}
                </span>
                <ul
                  className="grid grid-cols-1 gap-2.5"
                  data-testid="footer-categories"
                >
                  {productCategories?.slice(0, 6).map((c) => {
                    if (c.parent_category) {
                      return
                    }

                    const children =
                      c.category_children?.map((child) => ({
                        name: child.name,
                        handle: child.handle,
                        id: child.id,
                      })) || null

                    return (
                      <li
                        className="flex flex-col gap-2 text-content-inverse-muted"
                        key={c.id}
                      >
                        <LocalizedClientLink
                          className={clx(
                            "hover:text-content-inverse hover:underline motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse",
                            children && "font-semibold text-content-inverse",
                          )}
                          href={`/categories/${c.handle}`}
                          data-testid="category-link"
                        >
                          {c.name}
                        </LocalizedClientLink>
                        {children && (
                          <ul className="[margin-inline-start:0.75rem] grid grid-cols-1 gap-2">
                            {children &&
                              children.map((child) => (
                                <li key={child.id}>
                                  <LocalizedClientLink
                                    className="text-xs text-content-inverse-muted hover:text-content-inverse hover:underline motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse"
                                    href={`/categories/${child.handle}`}
                                    data-testid="category-link"
                                  >
                                    {child.name}
                                  </LocalizedClientLink>
                                </li>
                              ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {collections && collections.length > 0 && (
              <div className="flex flex-col gap-y-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-content-inverse">
                  {t.collections}
                </span>
                <ul
                  className={clx(
                    "grid grid-cols-1 gap-2.5 text-content-inverse-muted",
                    {
                      "grid-cols-2": (collections?.length || 0) > 3,
                    },
                  )}
                >
                  {collections?.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <LocalizedClientLink
                        className="hover:text-content-inverse hover:underline motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse"
                        href={`/collections/${c.handle}`}
                      >
                        {c.title}
                      </LocalizedClientLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-y-3">
              <span className="text-xs uppercase tracking-wider font-semibold text-content-inverse">
                {t.aboutUs}
              </span>
              <ul className="grid grid-cols-1 gap-y-2.5 text-content-inverse-muted">
                <li>
                  <LocalizedClientLink
                    className="hover:text-content-inverse hover:underline motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse"
                    href="#"
                  >
                    {t.shippingPolicy}
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    className="hover:text-content-inverse hover:underline motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse"
                    href="#"
                  >
                    {t.returnPolicy}
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    className="hover:text-content-inverse hover:underline motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse"
                    href="#"
                  >
                    {t.helpFaq}
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    className="hover:text-content-inverse hover:underline motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse"
                    href="#"
                  >
                    {t.contactUs}
                  </LocalizedClientLink>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex w-full flex-col items-start gap-3 border-t border-surface-inverse-raised py-8 text-xs text-content-inverse-muted xsmall:flex-row xsmall:items-center xsmall:justify-between">
          <Text className="text-xs">
            © {new Date().getFullYear()} Berca Store. {t.allRightsReserved}
          </Text>
          <Text className="text-xs font-medium uppercase text-content-inverse-muted">{countryCode}</Text>
        </div>
      </div>
    </footer>
  )
}
