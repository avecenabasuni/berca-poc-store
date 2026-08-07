const SkeletonCardDetails = () => {
  return (
    <div className="my-4 flex flex-col gap-1">
      <div className="h-4 bg-ui-bg-component-pressed rounded-md w-1/4 animate-pulse mb-1"></div>
      <div className="pt-3 pb-1 block w-full h-11 px-4 mt-0 bg-ui-bg-field border rounded-md appearance-none border-ui-border-base animate-pulse" />
    </div>
  )
}

export default SkeletonCardDetails
