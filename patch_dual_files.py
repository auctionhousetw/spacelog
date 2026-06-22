"""
為混用 houses + lvr 的頁面：
1. 在現有 prisma import 後加入 prismaLvr import
2. 把查詢 lvr_land / lvr_presale 的 $queryRawUnsafe 呼叫改為用 prismaLvr
"""
import re, sys

DUAL_FILES = [
    r"app\sitemap.ts",
    r"app\auction\[city]\[district]\[id]\page.tsx",
    r"app\page.tsx",
    r"app\community\[city]\[district]\[addr]\page.tsx",
    r"app\auction\[city]\[district]\page.tsx",
    r"app\auction\[city]\page.tsx",
    r"app\land-readjustment\[city]\[period]\page.tsx",
    r"app\presale\[city]\[district]\[project]\page.tsx",
    r"app\compare\[city]\[district]\page.tsx",
    r"app\compare\page.tsx",
    r"app\community\search\page.tsx",
]

LVR_IMPORT = "import prismaLvr from '@/lib/prisma-lvr';"

def add_lvr_import(content: str) -> str:
    """在 PrismaClient import 後插入 prismaLvr import（若尚未存在）"""
    if "prisma-lvr" in content:
        return content
    # 在 singleton 宣告後的空行插入
    target = "if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;"
    if target in content:
        return content.replace(target, target + "\n" + LVR_IMPORT)
    # fallback：在第一個 import 行後
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if line.startswith("import "):
            lines.insert(i + 1, LVR_IMPORT)
            return '\n'.join(lines)
    return content

def transform_query_calls(content: str) -> str:
    """
    找出所有 prisma.$queryRawUnsafe<any[]>(`...`) 區塊，
    若其內容含有 lvr_land 或 lvr_presale 則把 prisma. 換成 prismaLvr.
    """
    # 以 prisma.$queryRawUnsafe 為切割點
    parts = re.split(r'(prisma\.\$queryRawUnsafe)', content)
    result = []
    for i, part in enumerate(parts):
        if part == 'prisma.$queryRawUnsafe':
            # 往後看，到下一個 prisma.$queryRawUnsafe 或最多 60 行
            lookahead = parts[i + 1] if i + 1 < len(parts) else ''
            # 取下一段的前 2000 字來判斷
            snippet = lookahead[:2000]
            if 'lvr_land' in snippet or 'lvr_presale' in snippet:
                result.append('prismaLvr.$queryRawUnsafe')
            else:
                result.append(part)
        else:
            result.append(part)
    return ''.join(result)

import os
base = os.path.dirname(os.path.abspath(__file__))

for rel in DUAL_FILES:
    path = os.path.join(base, rel)
    if not os.path.exists(path):
        print(f"SKIP (not found): {rel}")
        continue
    with open(path, 'r', encoding='utf-8') as f:
        original = f.read()

    changed = add_lvr_import(original)
    changed = transform_query_calls(changed)

    if changed != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(changed)
        print(f"✅ {rel}")
    else:
        print(f"— no change: {rel}")
