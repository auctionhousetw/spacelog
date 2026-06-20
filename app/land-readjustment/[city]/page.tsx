export const revalidate = 86400;
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

type Params = Promise<{ city: string }>;

const TAICHUNG_PERIODS = [
  { slug: '1期',  name: '大智重劃區',      districts: ['東區'],                     area: '14.53',  year: '1967' },
  { slug: '2期',  name: '麻園頭重劃區',    districts: ['西區'],                     area: '24.26',  year: '1971' },
  { slug: '3期',  name: '忠明重劃區',      districts: ['西區'],                     area: '18.65',  year: '1975' },
  { slug: '4期',  name: '中正東山重劃區',  districts: ['北區', '北屯區', '西屯區'],  area: '440.66', year: '1980' },
  { slug: '5期',  name: '大墩重劃區',      districts: ['南屯區', '西屯區', '西區'],  area: '228.31', year: '1985' },
  { slug: '6期',  name: '干城重劃區',      districts: ['東區'],                     area: '19.43',  year: '1990' },
  { slug: '7期',  name: '惠來重劃區',      districts: ['西屯區', '南屯區'],          area: '353.40', year: '1992' },
  { slug: '8期',  name: '豐樂重劃區',      districts: ['南屯區'],                   area: '148.80', year: '1991' },
  { slug: '9期',  name: '旱溪重劃區',      districts: ['東區'],                     area: '120.53', year: '1994' },
  { slug: '10期', name: '軍功水景重劃區',  districts: ['北屯區'],                   area: '221.20', year: '2000' },
  { slug: '11期', name: '四張犁重劃區',    districts: ['北屯區'],                   area: '141.02', year: '1997' },
  { slug: '12期', name: '福星重劃區',      districts: ['西屯區'],                   area: '81.05',  year: '2008' },
  { slug: '13期', name: '大慶重劃區',      districts: ['南區', '南屯區'],            area: '229.57', year: '2015' },
  { slug: '14期', name: '美和庄重劃區',    districts: ['北屯區'],                   area: '403.39', year: '2015' },
  { slug: '15期', name: '大里杙重劃區',    districts: ['大里區'],                   area: '—',      year: '進行中' },
  { slug: '16期', name: '社皮重劃區',      districts: ['豐原區'],                   area: '—',      year: '完成' },
];

const CITY_DATA: Record<string, typeof TAICHUNG_PERIODS> = {
  '台中': TAICHUNG_PERIODS,
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city: cityEnc } = await params;
  const city = decodeURIComponent(cityEnc);
  if (!CITY_DATA[city]) return {};
  return {
    title: `${city}市重劃區一覽 | 公辦市地重劃 1～16期`,
    description: `${city}市公辦市地重劃區完整列表，含1期大智至16期社皮，各期行政區範圍、法拍物件、預售建案、實價行情查詢。`,
    alternates: { canonical: `/land-readjustment/${cityEnc}` },
  };
}

export default async function CityLandReadjustmentPage({ params }: { params: Params }) {
  const { city: cityEnc } = await params;
  const city = decodeURIComponent(cityEnc);
  const periods = CITY_DATA[city];
  if (!periods) notFound();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: #f7f6f3; font-family: 'Noto Sans TC', sans-serif; color: #333; }
        .site-bar { background: #fff; border-bottom: 1px solid #ececec; position: sticky; top: 0; z-index: 100; }
        .site-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem); display: flex; align-items: center; gap: 1rem; height: 52px; }
        .site-logo { font-family: 'Noto Serif TC', serif; font-size: 1.05rem; font-weight: 700; color: #c2632a; text-decoration: none; flex-shrink: 0; }
        .site-logo span { font-size: .72rem; color: #aaa; margin-left: 6px; }
        .nav-link { font-size: .82rem; color: #888; text-decoration: none; padding: .3rem .7rem; }
        .crumb { font-size: 11px; color: #bbb; text-decoration: none; }
        .crumb:hover { color: '#7b5ea7'; }
        .wrap { max-width: 960px; margin: 0 auto; padding: clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,1.75rem) 4rem; }
        .period-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e0e0f0; font-size: .82rem; }
        .period-table th { background: #f7f4ff; color: #7b5ea7; font-weight: 600; padding: .55rem .85rem; text-align: left; border-bottom: 2px solid #c8b8e8; font-size: .72rem; letter-spacing: .04em; }
        .period-table td { padding: .6rem .85rem; border-bottom: 1px solid #f5f3ff; vertical-align: middle; }
        .period-table tr:hover td { background: #faf8ff; }
        .period-link { font-family: 'Noto Serif TC', serif; font-weight: 700; color: #1a2a4a; text-decoration: none; font-size: .95rem; }
        .period-link:hover { color: #7b5ea7; text-decoration: underline; }
        .period-subname { font-size: .72rem; color: #aaa; }
        .dist-tag { display: inline-block; background: #f7f4ff; color: #7b5ea7; border: 1px solid #c8b8e8; font-size: .68rem; padding: .1rem .45rem; border-radius: 2px; margin: 1px; }
        .area-val { font-family: 'Noto Serif TC', serif; color: #444; font-size: .82rem; }
        .year-val { color: #888; font-size: .78rem; }
        .action-btn { display: inline-block; font-size: .72rem; background: #fff; border: 1px solid #c8b8e8; color: #7b5ea7; padding: .25rem .65rem; border-radius: 2px; text-decoration: none; white-space: nowrap; }
        .action-btn:hover { background: #f7f4ff; }
      `}</style>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',   item: process.env.NEXT_PUBLIC_BASE_URL || '' },
          { '@type': 'ListItem', position: 2, name: '重劃區', item: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/land-readjustment` },
          { '@type': 'ListItem', position: 3, name: `${city}市` },
        ],
      }) }} />

      <header className="site-bar">
        <div className="site-bar-inner">
          <a href="/" className="site-logo">法拍屋<span>資訊平台</span></a>
          <a href="/land-readjustment" className="nav-link" style={{ color: '#7b5ea7' }}>重劃區</a>
          <a href="/price"   className="nav-link">實價登錄</a>
          <a href="/auction" className="nav-link">法拍屋</a>
          <a href="/presale" className="nav-link">預售屋</a>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '4px solid #7b5ea7', padding: 'clamp(1.25rem,4vw,2rem) clamp(1rem,3vw,2rem)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <nav style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: '.85rem', flexWrap: 'wrap' }}>
            <a href="/land-readjustment" className="crumb">重劃區</a>
            <span style={{ color: '#e0e0e0' }}>›</span>
            <span style={{ color: '#7b5ea7', fontWeight: 500 }}>{city}市</span>
          </nav>
          <p style={{ fontSize: '.7rem', fontWeight: 500, letterSpacing: '.2em', color: '#7b5ea7', marginBottom: '.4rem' }}>LAND READJUSTMENT · {city.toUpperCase()}</p>
          <h1 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 'clamp(1.2rem,4vw,1.75rem)', fontWeight: 700, color: '#1a2a4a', marginBottom: '.5rem', lineHeight: 1.55 }}>
            {city}市公辦市地重劃區
          </h1>
          <p style={{ fontSize: '.82rem', color: '#888', fontWeight: 300, lineHeight: 1.9, margin: 0 }}>
            共 {periods.length} 期，來源：臺中市政府地政局、維基百科各期條目。
          </p>
        </div>
      </div>

      <div className="wrap">
        <div style={{ overflowX: 'auto' }}>
          <table className="period-table">
            <thead>
              <tr>
                <th style={{ minWidth: 80 }}>期別</th>
                <th style={{ minWidth: 120 }}>正式名稱</th>
                <th style={{ minWidth: 180 }}>行政區</th>
                <th style={{ minWidth: 80, textAlign: 'right' }}>面積（公頃）</th>
                <th style={{ minWidth: 70 }}>完成</th>
                <th style={{ minWidth: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {periods.map(({ slug, name, districts, area, year }) => (
                <tr key={slug}>
                  <td>
                    <a href={`/land-readjustment/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`} className="period-link">
                      {city}{slug}
                    </a>
                  </td>
                  <td><span className="period-subname">{name}</span></td>
                  <td>{districts.map(d => <span key={d} className="dist-tag">{d}</span>)}</td>
                  <td style={{ textAlign: 'right' }}><span className="area-val">{area}</span></td>
                  <td><span className="year-val">{year}</span></td>
                  <td>
                    <a href={`/land-readjustment/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`} className="action-btn">查看 →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '2rem', background: '#f7f4ff', border: '1px solid #c8b8e8', borderLeft: '4px solid #7b5ea7', padding: '1rem 1.25rem', fontSize: '.78rem', color: '#9b7ec7', lineHeight: 1.9 }}>
          <strong style={{ color: '#7b5ea7' }}>資料說明</strong><br />
          · 1至14期為原臺中市辦理，15期起為2010年縣市合併後辦理<br />
          · 第16期社皮重劃區原為臺中縣第7期，合併後統一編號<br />
          · 面積資料來源：臺中市市地重劃成果簡介
        </div>
      </div>
    </>
  );
}
