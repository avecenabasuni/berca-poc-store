"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

const RouteFocusHandler = ({ targetId }: { targetId: string }) => {
  const pathname = usePathname()
  const isInitialRender = useRef(true)

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }

    document.getElementById(targetId)?.focus()
  }, [pathname, targetId])

  return null
}

export default RouteFocusHandler
