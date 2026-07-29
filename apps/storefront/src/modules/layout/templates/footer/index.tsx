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
    <footer className="bg-[#1E1F74] text-[#F5F5F7] border-t border-[#3A1E65] w-full">
      <div className="content-container flex flex-col w-full">
        <div className="flex flex-col gap-y-10 xsmall:flex-row items-start justify-between py-16 small:py-20">
          <div className="flex flex-col gap-y-4 max-w-sm">
            <LocalizedClientLink
              href="/"
              className="text-2xl font-bold tracking-tight text-white hover:text-[#E53946] transition-colors uppercase"
            >
              Berca Store
            </LocalizedClientLink>
            <Text className="text-sm text-[#CFCFD4] leading-relaxed">
              {t.description}
            </Text>
          </div>
          <div className="text-sm gap-10 md:gap-x-16 grid grid-cols-2 sm:grid-cols-3">
            {productCategories && productCategories?.length > 0 && (
              <div className="flex flex-col gap-y-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-[#E53946]">
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
                        className="flex flex-col gap-2 text-[#CFCFD4]"
                        key={c.id}
                      >
                        <LocalizedClientLink
                          className={clx(
                            "hover:text-[#E53946] transition-colors",
                            children && "font-semibold text-white",
                          )}
                          href={`/categories/${c.handle}`}
                          data-testid="category-link"
                        >
                          {c.name}
                        </LocalizedClientLink>
                        {children && (
                          <ul className="grid grid-cols-1 ml-3 gap-2">
                            {children &&
                              children.map((child) => (
                                <li key={child.id}>
                                  <LocalizedClientLink
                                    className="hover:text-[#E53946] transition-colors text-xs text-[#CFCFD4]"
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
                <span className="text-xs uppercase tracking-wider font-semibold text-[#E53946]">
                  {t.collections}
                </span>
                <ul
                  className={clx(
                    "grid grid-cols-1 gap-2.5 text-[#CFCFD4]",
                    {
                      "grid-cols-2": (collections?.length || 0) > 3,
                    },
                  )}
                >
                  {collections?.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <LocalizedClientLink
                        className="hover:text-[#E53946] transition-colors"
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
              <span className="text-xs uppercase tracking-wider font-semibold text-[#E53946]">
                {t.aboutUs}
              </span>
              <ul className="grid grid-cols-1 gap-y-2.5 text-[#CFCFD4]">
                <li>
                  <LocalizedClientLink
                    className="hover:text-[#E53946] transition-colors"
                    href="#"
                  >
                    {t.shippingPolicy}
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    className="hover:text-[#E53946] transition-colors"
                    href="#"
                  >
                    {t.returnPolicy}
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    className="hover:text-[#E53946] transition-colors"
                    href="#"
                  >
                    {t.helpFaq}
                  </LocalizedClientLink>
                </li>
                <li>
                  <LocalizedClientLink
                    className="hover:text-[#E53946] transition-colors"
                    href="#"
                  >
                    {t.contactUs}
                  </LocalizedClientLink>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex w-full py-8 border-t border-[#3A1E65] justify-between items-center text-xs text-[#CFCFD4]/70">
          <Text className="text-xs">
            © {new Date().getFullYear()} Berca Store. {t.allRightsReserved}
          </Text>
          <Text className="text-xs text-[#CFCFD4] font-medium uppercase">{countryCode}</Text>
        </div>
      </div>
    </footer>
  )
}
