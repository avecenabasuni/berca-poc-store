import { Button, Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <div className="relative h-[85vh] w-full overflow-hidden">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80"
          alt="Berca Store - Koleksi fashion terbaru"
          className="h-full w-full object-cover"
          priority="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/30" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full items-center">
        <div className="content-container flex flex-col gap-6 max-w-2xl">
          <Text className="text-white/90 uppercase tracking-widest text-sm font-medium">
            Koleksi Terbaru 2026
          </Text>
          <Heading
            level="h1"
            className="text-4xl small:text-6xl leading-tight text-white font-semibold"
          >
            Belanja Lebih Mudah,{" "}
            <span className="text-white">Lebih Cepat</span>
          </Heading>
          <Text className="text-white/90 text-lg max-w-md font-normal leading-relaxed">
            Temukan berbagai pilihan produk berkualitas dengan harga terbaik.
            Pengiriman cepat ke seluruh Indonesia.
          </Text>
          <div className="flex gap-4 mt-4">
            <LocalizedClientLink href="/store">
              <Button variant="primary" className="w-fit bg-white text-black hover:bg-gray-100">
                Belanja Sekarang
              </Button>
            </LocalizedClientLink>
            <LocalizedClientLink href="/collections">
              <Button
                variant="secondary"
                className="w-fit bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                Lihat Koleksi
              </Button>
            </LocalizedClientLink>
          </div>
        </div>
      </div>

      {/* Bottom decorative bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="content-container py-4">
          <div className="flex items-center justify-between text-white/70 text-xs uppercase tracking-wider font-medium">
            <span>Pengiriman Gratis</span>
            <span className="hidden small:inline">|</span>
            <span>Garansi Resmi</span>
            <span className="hidden small:inline">|</span>
            <span>Bayar di Tempat</span>
            <span className="hidden small:inline">|</span>
            <span className="hidden small:inline">Customer Service 24/7</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero
