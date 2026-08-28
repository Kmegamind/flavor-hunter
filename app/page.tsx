import { Tracker } from "@/components/Tracker"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>
}) {
  const sp = await searchParams
  return <Tracker fixturePrefetch={sp.fixture} />
}
