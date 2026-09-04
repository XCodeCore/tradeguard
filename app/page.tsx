import { TradeDashboard } from "@/components/trade-dashboard";

export default function Home() {
  return <TradeDashboard developmentPreview={process.env.NODE_ENV === "development"} />;
}
