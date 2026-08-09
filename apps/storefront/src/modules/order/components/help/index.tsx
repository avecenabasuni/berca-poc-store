import { Heading } from "@modules/common/components/ui"
import { getDictionary } from "@lib/i18n"
import React from "react"

const Help = () => {
  const t = getDictionary().order

  return (
    <div className="mt-6 rounded-xl border border-line-subtle bg-surface-subtle p-4">
      <Heading className="text-base-semi text-content-primary">
        {t.helpTitle}
      </Heading>
      <p className="mt-1 text-sm leading-6 text-content-secondary">
        {t.helpDescription}
      </p>
    </div>
  )
}

export default Help
