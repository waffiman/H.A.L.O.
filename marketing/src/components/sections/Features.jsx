import SectionHeading from '../SectionHeading';
import FeatureCard from '../FeatureCard';
import smartReporting from '../../assets/feat-smart-reporting.png';
import data from '../../assets/feat-data.png';
import networks from '../../assets/feat-networks.png';
import oneScan from '../../assets/feat-one-scan.png';

// Figma Homepage > Features (1:25990). Cards alternate 510/642 widths per row.
export default function Features() {
  return (
    <section className="relative py-20">
      <div className="mx-auto w-full max-w-shell px-6">
        <SectionHeading badge="Features" title="Secure Wallet Complete">
          Our crypto experts are here to help you anytime, anywhere — so you never face trading
          challenges alone Buy, sell, and showcase.
        </SectionHeading>

        <div className="mt-16 rounded-3xl border border-solid border-[#161616] bg-[#0b0b0b] p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[510fr_642fr]">
            <FeatureCard
              title="Smart Reporting"
              art={smartReporting}
              artWidth={510}
              alt="Balanced, trade and lost figures shown as coloured report tiles"
            >
              Generate detailed financial reports instantly from cash flow to profit and loss statements.
            </FeatureCard>
            <FeatureCard
              title="Data"
              art={data}
              artWidth={642}
              alt="Area chart rising to a $74,638.00 price marker"
            >
              Go beyond basic reporting with advanced analytics tools.
            </FeatureCard>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[642fr_510fr]">
            <FeatureCard
              title="Crypto Networks"
              art={networks}
              artWidth={642}
              alt="Token icons linked to a central currency node over a world map"
            >
              Manage assets across multiple blockchains effortlessly.
            </FeatureCard>
            <FeatureCard
              title="One Scan"
              art={oneScan}
              artWidth={510}
              alt="Glowing scanner chip emitting cyan and orange light"
            >
              From transactions to documents, scanning brings everything to your fingertips.
            </FeatureCard>
          </div>
        </div>
      </div>
    </section>
  );
}
