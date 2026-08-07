"use client"

import { Dialog, Transition } from "@headlessui/react"
import { ArrowRight, BarsThree, XMark } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { Fragment, useState } from "react"
import { useParams } from "next/navigation"

import { getDictionary } from "@lib/i18n"
import { Locale } from "@lib/data/locales"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Text } from "@modules/common/components/ui"
import CountrySelect from "../country-select"
import LanguageSelect from "../language-select"

type SideMenuProps = {
  regions: HttpTypes.StoreRegion[] | null
  locales: Locale[] | null
  currentLocale: string | null
}

const SideMenu = ({ regions, locales, currentLocale }: SideMenuProps) => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode)
  const [isOpen, setIsOpen] = useState(false)

  const close = () => setIsOpen(false)

  const sideMenuItems = [
    { name: t.nav.home, href: "/", id: "home" },
    { name: t.nav.store, href: "/store", id: "store" },
    { name: t.nav.account, href: "/account", id: "account" },
    { name: t.nav.cart, href: "/cart", id: "cart" },
  ]

  return (
    <div className="flex h-full items-center">
      <button
        type="button"
        data-testid="nav-menu-button"
        onClick={() => setIsOpen(true)}
        className="relative flex h-full min-h-11 min-w-11 touch-manipulation items-center gap-2 rounded-full px-3 py-1.5 font-medium text-content-primary motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle hover:text-content-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
      >
        <BarsThree className="h-5 w-5" aria-hidden="true" />
        <span className="hidden text-xs font-semibold uppercase tracking-wider xsmall:inline">
          {t.nav.menu}
        </span>
        <span className="sr-only xsmall:hidden">{t.nav.menu}</span>
      </button>

      <Transition appear show={isOpen} as={Fragment}>
        <Dialog className="relative z-[75]" onClose={close}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-out duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div
              className="fixed inset-0 bg-black/60"
              aria-hidden="true"
              data-testid="side-menu-backdrop"
            />
          </Transition.Child>

          <div className="fixed inset-0 overflow-hidden">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 -translate-x-full"
              enterTo="opacity-100 translate-x-0"
            leave="ease-out duration-150"
              leaveFrom="opacity-100 translate-x-0"
              leaveTo="opacity-0 -translate-x-full"
            >
              <Dialog.Panel
                className="fixed inset-y-0 left-0 flex h-full w-full max-w-[400px] flex-col overflow-y-auto overscroll-contain bg-surface-inverse text-sm text-content-inverse shadow-2xl"
                data-testid="nav-menu-popup"
              >
                <div className="flex min-h-full flex-col justify-between border-r border-surface-inverse-raised p-6 xsmall:p-8">
                  <div>
                    <div className="flex min-h-11 items-center justify-between border-b border-content-inverse/15 pb-5">
                      <Dialog.Title
                        className="text-lg font-bold uppercase tracking-tight text-content-inverse"
                        translate="no"
                      >
                        Berca Store
                      </Dialog.Title>
                      <button
                        type="button"
                        autoFocus
                        data-testid="close-menu-button"
                        onClick={close}
                        aria-label={t.nav.closeMenu}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-content-inverse/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse motion-safe:active:scale-[0.96]"
                      >
                        <XMark aria-hidden="true" />
                      </button>
                    </div>

                    <nav aria-label={t.nav.storeMenu}>
                      <ul className="flex flex-col items-start justify-start gap-3 py-6">
                        {sideMenuItems.map((item) => (
                          <li key={item.id} className="w-full">
                            <LocalizedClientLink
                              href={item.href}
                              className="group flex min-h-11 items-center justify-between rounded-xl px-4 py-3 text-3xl font-bold leading-10 text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-content-inverse/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content-inverse motion-safe:active:scale-[0.96]"
                              onClick={close}
                              data-testid={`${item.id}-link`}
                            >
                              <span>{item.name}</span>
                              <ArrowRight
                                aria-hidden="true"
                                className="h-5 w-5 text-content-inverse-muted opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-out group-hover:translate-x-1 group-hover:opacity-100"
                              />
                            </LocalizedClientLink>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  </div>

                  <div className="flex flex-col gap-y-5 rounded-2xl border border-content-inverse/10 bg-surface-inverse-raised p-5 text-content-inverse">
                    {!!locales?.length && (
                      <LanguageSelect
                        locales={locales}
                        currentLocale={currentLocale}
                      />
                    )}
                    {regions && <CountrySelect regions={regions} />}
                    <Text className="flex justify-between text-xs font-medium text-content-inverse-muted">
                      © {new Date().getFullYear()} Berca Store. {t.footer.allRightsReserved}
                    </Text>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}

export default SideMenu
