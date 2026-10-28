/** Customer Service presentation only. Existing Hero is the migration default. */
export const DEFAULT_SERVICE_HERO = {
  src: "/images/home003/kd-coffee-choose-coffee-by-flavor-v01.webp",
  alt: "KD Coffee 咖啡風味品飲情境",
  position: "original",
} as const;
export const SERVICE_HERO_POSITIONS = {
  original: "沿用目前裁切", center: "置中", left: "靠左", right: "靠右", top: "靠上", bottom: "靠下",
} as const;
export type ServiceHero = { src: string; alt: string; position: keyof typeof SERVICE_HERO_POSITIONS };
export function serviceHeroPosition(hero: ServiceHero, mobile = false) {
  return hero.position === "original" ? (mobile ? "50% 15%" : "43% 52%")
    : ({ center: "50% 50%", left: "0% 50%", right: "100% 50%", top: "50% 0%", bottom: "50% 100%" } as const)[hero.position];
}
