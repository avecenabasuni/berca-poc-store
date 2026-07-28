"use client"

import { Popover, PopoverPanel, Transition } from "@headlessui/react"
import useToggleState from "@lib/hooks/use-toggle-state"
import { ArrowRightMini, XMark } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Text, clx } from "@modules/common/components/ui"
import { Fragment, useEffect } from "react"
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

const SideMenuDrawer = ({
  open,
  close,
  regions,
  locales,
  currentLocale,
  countryToggleState,
  languageToggleState,
}: {
  open: boolean
  close: () => void
  regions: HttpTypes.StoreRegion[] | null
  locales: Locale[] | null
  currentLocale: string | null
  countryToggleState: ReturnType<typeof useToggleState>
  languageToggleState: ReturnType<typeof useToggleState>
}) => {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/75 backdrop-blur-sm pointer-events-auto"
        onClick={close}
        data-testid="side-menu-backdrop"
      />
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
        <PopoverPanel
          className="fixed inset-y-0 left-0 z-[9999] w-full sm:w-[400px] h-screen bg-[#1E1F74] text-white shadow-2xl flex flex-col justify-between p-8 border-r border-[#3A1E65] overflow-y-auto"
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

          <ul className="flex flex-col gap-3 items-start justify-start py-6 my-auto">
            {Object.entries(SideMenuItems).map(([name, href]) => {
              return (
                <li key={name} className="w-full">
                  <LocalizedClientLink
                    href={href}
                    className="text-3xl font-bold leading-10 text-white hover:text-[#E53946] hover:bg-white/10 px-4 py-3 rounded-xl transition-all duration-200 flex items-center justify-between group"
                    style={{ color: "#FFFFFF" }}
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
              © {new Date().getFullYear()} Berca Store. All rights reserved.
            </Text>
          </div>
        </PopoverPanel>
      </Transition>
    </>
  )
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

              <SideMenuDrawer
                open={open}
                close={close}
                regions={regions}
                locales={locales}
                currentLocale={currentLocale}
                countryToggleState={countryToggleState}
                languageToggleState={languageToggleState}
              />
            </>
          )}
        </Popover>
      </div>
    </div>
  )
}

export default SideMenu
