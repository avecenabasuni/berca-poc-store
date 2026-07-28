"use client"

import { Popover, PopoverPanel, Transition } from "@headlessui/react"
import useToggleState from "@lib/hooks/use-toggle-state"
import { ArrowRightMini, XMark } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Text, clx } from "@modules/common/components/ui"
import { Fragment } from "react"
import CountrySelect from "../country-select"
import LanguageSelect from "../language-select"
import { Locale } from "@lib/data/locales"

const SideMenuItems = {
  Home: "/",
  Store: "/store",
  Account: "/account",
  Cart: "/cart",
}

type SideMenuProps = {
  regions: HttpTypes.StoreRegion[] | null
  locales: Locale[] | null
  currentLocale: string | null
}

const SideMenu = ({ regions, locales, currentLocale }: SideMenuProps) => {
  const countryToggleState = useToggleState()
  const languageToggleState = useToggleState()

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <Popover className="h-full flex">
          {({ open, close }) => (
            <>
              <div className="relative flex h-full">
                <Popover.Button
                  data-testid="nav-menu-button"
                  className="relative h-full flex items-center transition-all ease-out duration-200 focus:outline-none hover:text-ui-fg-base"
                >
                  Menu
                </Popover.Button>
              </div>

              {open && (
                <div
                  className="fixed inset-0 z-[50] bg-black/60 backdrop-blur-sm pointer-events-auto"
                  onClick={close}
                  data-testid="side-menu-backdrop"
                />
              )}

              <Transition
                show={open}
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 -translate-x-full"
                enterTo="opacity-100 translate-x-0"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-x-0"
                leaveTo="opacity-0 -translate-x-full"
              >
                <PopoverPanel className="flex flex-col fixed w-full sm:w-[380px] h-full z-[51] inset-y-0 left-0 text-sm text-white shadow-2xl">
                  <div
                    data-testid="nav-menu-popup"
                    className="flex flex-col h-full bg-gradient-to-b from-[#1E1F74] via-[#3A1E65] to-[#582158] justify-between p-8 border-r border-white/10"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 pb-4" id="xmark">
                      <span className="text-sm uppercase tracking-widest font-semibold text-[#E53946]">
                        Navigasi
                      </span>
                      <button
                        data-testid="close-menu-button"
                        onClick={close}
                        className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
                      >
                        <XMark />
                      </button>
                    </div>
                    <ul className="flex flex-col gap-6 items-start justify-start py-6">
                      {Object.entries(SideMenuItems).map(([name, href]) => {
                        return (
                          <li key={name} className="w-full">
                            <LocalizedClientLink
                              href={href}
                              className="text-3xl font-bold leading-10 text-white hover:text-[#E53946] transition-colors flex items-center justify-between group"
                              onClick={close}
                              data-testid={`${name.toLowerCase()}-link`}
                            >
                              <span>{name}</span>
                              <span className="text-xl opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200 text-[#E53946]">
                                →
                              </span>
                            </LocalizedClientLink>
                          </li>
                        )
                      })}
                    </ul>
                    <div className="flex flex-col gap-y-6 border-t border-white/10 pt-6">
                      {!!locales?.length && (
                        <div
                          className="flex justify-between items-center text-white/90"
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
                        className="flex justify-between items-center text-white/90"
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
                      <Text className="flex justify-between text-xs text-white/60">
                        © {new Date().getFullYear()} Berca Store. All rights
                        reserved.
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
