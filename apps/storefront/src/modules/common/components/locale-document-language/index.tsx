"use client"

import { useEffect } from "react"

const LocaleDocumentLanguage = ({ language }: { language: "en" | "id" }) => {
  useEffect(() => {
    const previousLanguage = document.documentElement.lang
    document.documentElement.lang = language

    return () => {
      document.documentElement.lang = previousLanguage
    }
  }, [language])

  return null
}

export default LocaleDocumentLanguage
