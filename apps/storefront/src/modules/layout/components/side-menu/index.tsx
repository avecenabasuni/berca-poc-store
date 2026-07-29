"use client"

import { Popover, PopoverPanel, Transition } from "@headlessui/react"
import useToggleState from "@lib/hooks/use-toggle-state"
import { ArrowRightMini, XMark, BarsThree } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Text, clx } from "@modules/common/components/ui"
import { Fragment } from "react"
import CountrySelect from "../country-select"
import LanguageSelect from "../language-select"
import { Locale } from "@lib/data/locales"
import { useParams } from "next/navigation"
import { getDictionary } from "@lib/i18n"

type SideMenuProps = {
  regions: HttpTypes.StoreRegion[] | null
  locales: Locale[] | null
  currentLocale: string | null
}

const SideMenu = ({ regions, locales, currentLocale }: SideMenuProps) => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode)
  const countryToggleState = useToggleState()
  const languageToggleState = useToggleState()

  const sideMenuItems = [
    { name: t.nav.home, href: "/", id: "home" },
    { name: t.nav.store, href: "/store", id: "store" },
    { name: t.nav.account, href: "/account", id: "account" },
    { name: t.nav.cart, href: "/cart", id: "cart" },
  ]

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <Popover className="h-full flex">
          {({ open, close }) => (
            <>
              <div className="relative flex h-full">
                <Popover.Button
                  data-testid="nav-menu-button"
                  className="relative h-full flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[#F5F5F7] text-[#1E1F74] hover:text-[#E53946] transition-all ease-out duration-200 focus:outline-none font-medium"
                >
                  <BarsThree className="w-5 h-5" />
                  <span className="hidden xsmall:inline text-xs font-semibold uppercase tracking-wider">{t.nav.menu}</span>
                </Popover.Button>
              </div>

              {open && (
                <div
                  className="fixed inset-0 z-[50] bg-black/60 pointer-events-auto"
                  onClick={close}
                  data-testid="side-menu-backdrop"
                />
              )}

              <Transition
                show={open}
                as={Fragment}
                enter="transition ease-out duration-250"
                enterFrom="opacity-0 -translate-x-full"
                enterTo="opacity-100 translate-x-0"
                leave="transition ease-in duration-200"
                leaveFrom="opacity-100 translate-x-0"
                leaveTo="opacity-0 -translate-x-full"
              >
                <PopoverPanel className="flex flex-col fixed w-full sm:w-[400px] h-full z-[51] inset-y-0 left-0 text-sm shadow-2xl bg-[#1E1F74]">
                  <div
                    data-testid="nav-menu-popup"
                    className="flex flex-col h-full justify-between p-8 border-r border-[#3A1E65] bg-[#1E1F74]"
                    style={{ backgroundColor: "#1E1F74", color: "#FFFFFF" }}
                  >
                    <div className="flex items-center justify-between border-b border-white/15 pb-5" id="xmark">
                      <span className="text-lg font-bold tracking-tight text-white uppercase">
                        Berca Store
                      </span>
                      <button
                        data-testid="close-menu-button"
                        onClick={close}
                        className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
                        style={{ color: "#FFFFFF" }}
                      >
                        <XMark />
                      </button>
                    </div>
                    <ul className="flex flex-col gap-3 items-start justify-start py-6">
                      {sideMenuItems.map((item) => {
                        return (
                          <li key={item.id} className="w-full">
                            <LocalizedClientLink
                              href={item.href}
                              className="text-3xl font-bold leading-10 text-white hover:text-[#E53946] hover:bg-white/10 px-4 py-3 rounded-xl transition-all duration-200 flex items-center justify-between group"
                              style={{ color: "#FFFFFF" }}
                              onClick={close}
                              data-testid={`${item.id}-link`}
                            >
                              <span>{item.name}</span>
                              <span className="text-xl opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200 text-[#E53946]">
                                →
                              </span>
                            </LocalizedClientLink>
                          </li>
                        )
                      })}
                    </ul>
                    <div
                      className="flex flex-col gap-y-5 p-5 rounded-2xl border border-white/10"
                      style={{ backgroundColor: "#3A1E65", color: "#FFFFFF" }}
                    >
                      {!!locales?.length && (
                        <div
                          className="flex justify-between items-center text-white font-medium"
                          onMouseEnter={languageToggleState.open}
                          onMouseLeave={languageToggleState.close}
                        >
                          <LanguageSelect
                            toggleState={languageToggleState}
                            locales={locales}
                            currentLocale={currentLocale}
                          />
                          <ArrowRightMini
                            className={clx(
                              "transition-transform duration-150 text-white",
                              languageToggleState.state ? "-rotate-90" : "",
                            )}
                          />
                        </div>
                      )}
                      <div
                        className="flex justify-between items-center text-white font-medium"
                        onMouseEnter={countryToggleState.open}
                        onMouseLeave={countryToggleState.close}
                      >
                        {regions && (
                          <CountrySelect
                            toggleState={countryToggleState}
                            regions={regions}
                          />
                        )}
                        <ArrowRightMini
                          className={clx(
                            "transition-transform duration-150 text-white",
                            countryToggleState.state ? "-rotate-90" : "",
                          )}
                        />
                      </div>
                      <Text className="flex justify-between text-xs text-white/70 font-medium">
                        © {new Date().getFullYear()} Berca Store. {t.footer.allRightsReserved}
                      </Text>
                    </div>
                  </div>
                </PopoverPanel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    </div>
  )
}

export default SideMenu
