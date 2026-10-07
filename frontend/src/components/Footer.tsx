import { Logo } from "./ui/Logo";

const columns = [
  { title: "Product", links: ["How it works", "Get started", "Sign in"] },
  { title: "Who it's for", links: ["Operations teams", "Warehouses", "Distributors", "Data teams"] },
  { title: "Company", links: ["About", "Contact"] },
  { title: "Resources", links: ["Help center", "System status"] },
];

const socials = [
  { label: "LinkedIn", viewBox: "0 0 448 512", path: "M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z" },
  { label: "X", viewBox: "0 0 512 512", path: "M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z" },
];

const legal = ["Services Agreement", "Privacy Policy"];

const quietLink = "rounded-lg transition-colors duration-300 hover:text-tertiary-foreground active:text-secondary-foreground";

export function Footer() {
  return (
    <footer className="dark flex min-h-[40svh] w-full flex-col justify-between border-t border-subtle-stroke bg-primary-background">
      <div className="container grid flex-1 grid-cols-12 gap-y-12 pt-20 pb-12">
        <a href="#" aria-label="RunOut homepage" className="col-[1/2] -m-1.5 rounded-lg p-1.5 text-white-200 max-lg:col-[1/3] max-md:col-[1/4] max-xs:col-[1/5]">
          <Logo className="h-auto w-full" />
        </a>
        <div className="col-[5/-1] columns-4 gap-0 max-xl:col-[4/-1] max-xl:columns-3 max-lg:col-[1/-1] max-lg:columns-2 max-xs:columns-1">
          {columns.map((col) => (
            <div key={col.title} className="break-inside-avoid pb-7">
              <h2 className="py-1 text-sm text-caption-foreground">{col.title}</h2>
              <ul className="flex flex-col">
                {col.links.map((label) => (
                  <li key={label}>
                    <a href="#" className="group -mx-1 flex w-fit rounded-lg p-1 text-sm font-normal text-tertiary-foreground transition-colors duration-150 hover:text-secondary-foreground active:text-primary-foreground">
                      <span className="hover-underline">{label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="container flex flex-wrap items-center justify-between gap-6 py-10">
        <div className="-ml-1 flex items-center gap-1">
          {socials.map(({ label, viewBox, path }) => (
            <a key={label} href="#" target="_blank" rel="noopener noreferrer" aria-label={`RunOut on ${label}`} className={`flex size-7 items-center justify-center text-caption-foreground ${quietLink}`}>
              <svg viewBox={viewBox} fill="currentColor" aria-hidden="true" className="size-4">
                <path d={path} />
              </svg>
            </a>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-normal text-caption-foreground">
          <p>© 2026 RunOut Ltd. All rights reserved.</p>
          {legal.map((label) => (
            <a key={label} href="#" className={`-mx-1 p-1 ${quietLink}`}>
              {label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
