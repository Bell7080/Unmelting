/**
 * 리소스 수명주기 검사 — `npm run resources:check`.
 *
 * 웹 게임 렉의 주범은 알고리즘이 아니라 같은 리소스를 반복 생성·디코딩하는
 * 코드다. 생성 지점을 "어느 파일에서 몇 개까지"로 고정해, 캐시를 우회하는 경로가
 * 리뷰 없이 늘어나지 못하게 막는다.
 *
 * 규칙을 어긴 코드가 정당하다면 이 표를 함께 고치고 커밋에 이유를 남긴다.
 * 표를 고치지 않고 통과시키는 우회는 하지 않는다.
 */
import { readFile, readdir } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = resolve(ROOT, 'src')

interface Rule {
  label: string
  pattern: RegExp
  /** 파일별 허용 개수. 목록에 없는 파일은 0개가 기준이다. */
  allowed: Record<string, number>
}

const rules: Rule[] = [
  {
    label: '이미지 생성은 프리로드 경로 한 곳에서만 허용합니다',
    pattern: /\bnew\s+Image\s*\(/g,
    allowed: { 'src/index.ts': 1 },
  },
  {
    label: 'HTMLAudioElement 직접 생성 대신 BgmManager/SfxManager를 사용해야 합니다',
    pattern: /\bnew\s+Audio\s*\(/g,
    allowed: {},
  },
  {
    label: 'AudioContext 생성은 효과음 매니저 한 곳에서만 허용합니다(BGM은 Howler가 소유)',
    pattern: /\bnew\s+(?:Ctor|AudioContext|webkitAudioContext)\s*\(/g,
    allowed: { 'src/audio/SfxManager.ts': 1 },
  },
  {
    label: 'BGM Howl 생성은 BgmManager 안에서만 허용합니다',
    pattern: /\bnew\s+Howl\s*\(/g,
    allowed: { 'src/audio/BgmManager.ts': 1 },
  },
  {
    label: '비디오 요소를 직접 만들지 않습니다(현재 사용처 없음)',
    pattern: /document\.createElement\(\s*['"]video['"]\s*\)/g,
    allowed: {},
  },
  {
    label: 'FontFace 생성은 FontManager 안에서만 허용합니다',
    pattern: /\bnew\s+FontFace\s*\(/g,
    allowed: {},
  },
  {
    // 고스트/플로팅 복제는 연출에 필요하지만, 개수를 잠가 두면 새 복제 경로가
    // 조용히 늘어날 때 반드시 이 표를 거치게 된다.
    label: 'DOM 복제(고스트 연출)는 등록된 파일에서만 허용합니다',
    pattern: /\.cloneNode\s*\(/g,
    allowed: {
      'src/ui/GameBoardRenderer.ts': 5,
      'src/ui/renderer/BossFxView.ts': 1,
      'src/ui/renderer/CompendiumView.ts': 1,
    },
  },
]

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(dir, entry.name)
      return entry.isDirectory() ? walk(path) : Promise.resolve([path])
    })
  )
  return nested.flat()
}

const files = (await walk(SRC)).filter(
  (file) =>
    extname(file) === '.ts' &&
    !file.endsWith('.test.ts') &&
    file !== resolve(SRC, 'tools/resource-lifecycle-check.ts')
)

const contents = new Map<string, string>()
await Promise.all(
  files.map(async (file) => {
    contents.set(relative(ROOT, file).split('\\').join('/'), await readFile(file, 'utf8'))
  })
)

const failures: string[] = []
for (const rule of rules) {
  const actual: Record<string, number> = {}
  for (const [file, source] of contents) {
    const count = [...source.matchAll(rule.pattern)].length
    if (count) actual[file] = count
  }
  const paths = new Set([...Object.keys(actual), ...Object.keys(rule.allowed)])
  for (const file of paths) {
    const count = actual[file] ?? 0
    const expected = rule.allowed[file] ?? 0
    if (count !== expected) {
      failures.push(`${rule.label}: ${file} ${count}개 (허용 ${expected}개)`)
    }
  }
}

if (failures.length) {
  failures.forEach((failure) => console.error(failure))
  process.exitCode = 1
} else {
  console.log('리소스 수명주기 검사 통과 — 직접 생성·복제 경로가 허용 목록 안에 있습니다.')
}
