import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  TOKEN_STORAGE_KEY,
  clearUserToken,
  ensureUserToken,
  getStoredToken,
  isValidTokenFormat,
  maskToken,
  regenerateUserToken,
  setUserToken
} from '../src/utils/token'
import { stubChromeStorage } from './helpers/chrome-storage'

const VALID_TOKEN = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'
const ISSUED_TOKEN = 'sc_CCCCCCCCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDD'
const REGEN_TOKEN = 'sc_EEEEEEEEEEEEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFFFFF'

const tokenJson = (token: unknown) =>
  new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })

describe('isValidTokenFormat', () => {
  it('accepts sc_ + 점 하나로 갈라지는 2조각만 통과시킨다', () => {
    const accepted = ['sc_a.b', VALID_TOKEN]
    const rejected = ['sc_a', 'a.b', 'sc_a.b.c', 'sc_', '', 'sc_.b', 'sc_a.']
    for (const value of accepted) {
      expect(isValidTokenFormat(value), value).toBe(true)
    }
    for (const value of rejected) {
      expect(isValidTokenFormat(value), value).toBe(false)
    }
  })

  it('문자열이 아닌 값을 거부한다', () => {
    for (const value of [undefined, null, 42, {}, ['sc_a.b']]) {
      expect(isValidTokenFormat(value)).toBe(false)
    }
  })
})

describe('ensureUserToken', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('저장된 유효 토큰이 있으면 재사용한다 (fetch 0회)', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureUserToken()).resolves.toBe(VALID_TOKEN)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('저장된 토큰이 없으면 POST /token 으로 발급받아 저장한다', async () => {
    const storage = stubChromeStorage()
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureUserToken()).resolves.toBe(ISSUED_TOKEN)

    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('https://w.example.dev/token')
    expect(opts.method).toBe('POST')
    // Origin 은 브라우저가 자동으로 붙이는 forbidden header — 직접 세팅하면 안 된다
    // (worker 는 chrome-extension:// Origin 이 없으면 403)
    expect(opts.headers).toBeUndefined()
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(ISSUED_TOKEN)
  })

  it('엔드포인트의 trailing slash 를 정규화한다', async () => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev/')
    stubChromeStorage()
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await ensureUserToken()
    expect(fetchMock.mock.calls[0][0]).toBe('https://w.example.dev/token')
  })

  it('동시 호출 2회가 발급 요청을 1번만 보낸다 (in-flight 가드)', async () => {
    const storage = stubChromeStorage()
    // 호출마다 새 Response — 하나를 공유하면 body 재사용 오류가 겹쳐 실패 원인이 흐려진다
    const fetchMock = vi.fn(async () => tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    // await 없이 동시 발사 — 가드가 storage 읽기 뒤에 걸리면 fetch 가 2번 나간다
    const first = ensureUserToken()
    const second = ensureUserToken()
    const [a, b] = await Promise.all([first, second])

    expect(a).toBe(ISSUED_TOKEN)
    expect(b).toBe(ISSUED_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(storage.set).toHaveBeenCalledTimes(1)
  })

  it('발급이 끝난 뒤에는 가드가 풀려 다음 호출이 저장분을 쓴다', async () => {
    stubChromeStorage()
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await ensureUserToken()
    await expect(ensureUserToken()).resolves.toBe(ISSUED_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('500(시크릿 미주입)이면 null 을 반환하고 storage 를 오염시키지 않는다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Server misconfigured', { status: 500 }))
    )

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.set).not.toHaveBeenCalled()
    expect(storage.store.has(TOKEN_STORAGE_KEY)).toBe(false)
    expect(console.warn).toHaveBeenCalled()
  })

  it('429(rate limit)이면 null 을 반환하고 사유를 warn 으로 남긴다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Too many token requests', { status: 429 }))
    )

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.store.has(TOKEN_STORAGE_KEY)).toBe(false)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('429'))
  })

  it('네트워크 오류면 throw 하지 않고 null 을 반환한다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.set).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('발급 응답의 토큰 형식이 깨졌으면 저장하지 않고 null 을 반환한다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenJson('nope')))

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.set).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  // CodeRabbit — res.json() 이 null 을 돌려주면 data.token 접근이 TypeError 다.
  // json() 자체는 성공하므로 catch 에 안 걸리고 Promise<string|null> 계약이 깨진다.
  it('본문이 JSON null 인 200 응답이면 던지지 않고 null 을 반환한다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('null', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.set).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('token 키가 없는 객체 응답이면 null 을 반환한다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('배열 응답처럼 객체가 아닌 JSON 도 null 로 떨어진다', async () => {
    stubChromeStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('[1,2]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )

    await expect(ensureUserToken()).resolves.toBeNull()
  })

  it('JSON 이 아닌 200 응답이면 null 을 반환한다', async () => {
    stubChromeStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>not json</html>', { status: 200 }))
    )

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalled()
  })

  it('손상된 저장값은 버리고 재발급한다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: 'sc_broken' })
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureUserToken()).resolves.toBe(ISSUED_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(ISSUED_TOKEN)
    expect(console.warn).toHaveBeenCalled()
  })

  it('storage 읽기가 실패하면 새 owner를 만들지 않고 중단한다', async () => {
    const storage = stubChromeStorage()
    storage.get.mockRejectedValueOnce(new Error('storage unavailable'))
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureUserToken()).rejects.toThrow('storage unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('storage 저장이 실패하면 접근 불가능한 owner에 업로드하지 않고 중단한다', async () => {
    const storage = stubChromeStorage()
    storage.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN)))

    await expect(ensureUserToken()).rejects.toThrow('QUOTA_BYTES quota exceeded')
    expect(console.warn).toHaveBeenCalled()
  })

  it('엔드포인트가 없으면 fetch 없이 null 을 반환한다', async () => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', '')
    stubChromeStorage()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('regenerateUserToken', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('기존 토큰이 있어도 강제로 POST /token 을 호출해 새 토큰으로 교체한다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await expect(regenerateUserToken()).resolves.toBe(ISSUED_TOKEN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('https://w.example.dev/token')
    expect(opts.method).toBe('POST')
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(ISSUED_TOKEN)
  })

  it('서버 500 이면 기존 토큰을 그대로 두고 에러를 던진다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Server misconfigured', { status: 500 }))
    )

    await expect(regenerateUserToken()).rejects.toThrow()
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(VALID_TOKEN)
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('429(rate limit)이면 기존 토큰을 그대로 두고 에러를 던진다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Too many token requests', { status: 429 }))
    )

    await expect(regenerateUserToken()).rejects.toThrow()
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(VALID_TOKEN)
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('네트워크 실패면 기존 토큰을 그대로 두고 에러를 던진다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(regenerateUserToken()).rejects.toThrow()
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(VALID_TOKEN)
  })

  it('저장(quota 초과 등)이 실패하면 기존 토큰을 그대로 두고 에러를 던진다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    storage.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN)))

    await expect(regenerateUserToken()).rejects.toThrow('QUOTA_BYTES quota exceeded')
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(VALID_TOKEN)
    expect(console.warn).toHaveBeenCalled()
  })

  it('동시 호출 2회가 발급 요청을 1번만 보낸다 (in-flight 가드)', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    const fetchMock = vi.fn(async () => tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    const first = regenerateUserToken()
    const second = regenerateUserToken()
    const [a, b] = await Promise.all([first, second])

    expect(a).toBe(ISSUED_TOKEN)
    expect(b).toBe(ISSUED_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(ISSUED_TOKEN)
  })
})

// 0.4.3 critic 지적 — ensureUserToken 과 regenerateUserToken 의 in-flight 가드가
// 서로 독립이라, 두 함수가 동시에 실행되면 나중에 끝난 쪽이 storage 를 덮어써 owner 가
// 파편화될 수 있었다(같은 사용자가 서로 다른 owner 로 갈라짐). 두 함수가 서로의
// in-flight 를 인지하도록 고친 뒤에도 fetch 횟수·최종 storage 값이 예측 가능해야 한다.
describe('ensureUserToken × regenerateUserToken in-flight 교차 가드 (경합)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('regenerate 진행 중 ensure 를 동시 호출해도 fetch 1회 · 같은 토큰 · storage 는 재발급 결과다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    const fetchMock = vi.fn(async () => tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    // await 없이 동시 발사 — regenerate 가 먼저 시작해 regenerateInFlight 를 채운 뒤
    // ensure 가 그걸 재사용해야 한다(각자 별도 발급을 하면 fetch 가 2회 나간다).
    const regenerate = regenerateUserToken()
    const ensure = ensureUserToken()
    const [regenerated, ensured] = await Promise.all([regenerate, ensure])

    expect(regenerated).toBe(ISSUED_TOKEN)
    expect(ensured).toBe(ISSUED_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(ISSUED_TOKEN)
  })

  it('ensure 진행 중 regenerate 를 호출하면 ensure 결과를 흡수한 뒤 강제 재발급해 storage 는 재발급 토큰으로 귀결된다', async () => {
    const storage = stubChromeStorage() // 저장된 토큰 없음 → ensure 가 발급 경로를 탄다
    let call = 0
    const fetchMock = vi.fn(async () => {
      call += 1
      return call === 1 ? tokenJson(ISSUED_TOKEN) : tokenJson(REGEN_TOKEN)
    })
    vi.stubGlobal('fetch', fetchMock)

    const ensure = ensureUserToken()
    const regenerate = regenerateUserToken()
    const [ensured, regenerated] = await Promise.all([ensure, regenerate])

    expect(ensured).toBe(ISSUED_TOKEN)
    expect(regenerated).toBe(REGEN_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // regenerate 가 ensure 의 발급을 기다린 뒤 강제로 새로 발급하므로 storage 최종값은
    // 항상 재발급 토큰이어야 한다 — ensure 가 나중에 자기 결과로 덮어쓰면 안 된다.
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(REGEN_TOKEN)
  })
})

describe('clearUserToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('저장된 토큰을 지운다 (서버가 거부한 토큰 폐기용)', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })

    await clearUserToken()

    expect(storage.remove).toHaveBeenCalledWith(TOKEN_STORAGE_KEY)
    expect(storage.store.has(TOKEN_STORAGE_KEY)).toBe(false)
  })

  it('지우기가 실패하면 같은 토큰 재사용을 막기 위해 오류를 드러낸다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    storage.remove.mockRejectedValueOnce(new Error('storage unavailable'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(clearUserToken()).rejects.toThrow('storage unavailable')
    expect(console.warn).toHaveBeenCalled()
  })

  it('지운 뒤 다음 호출은 재발급을 탄다', async () => {
    stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await clearUserToken()
    await expect(ensureUserToken()).resolves.toBe(ISSUED_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllEnvs()
  })
})

describe('getStoredToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('정상 저장값이 있으면 발급 없이 그대로 반환한다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getStoredToken()).resolves.toBe(VALID_TOKEN)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('저장된 값이 없으면 null 을 반환한다 (발급하지 않는다)', async () => {
    const storage = stubChromeStorage()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getStoredToken()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('손상된 저장값이면 null 을 반환한다 (폐기·재발급하지 않는다)', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: 'bad' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getStoredToken()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('storage 읽기가 실패하면 warn 후 null 을 반환한다', async () => {
    const storage = stubChromeStorage()
    storage.get.mockRejectedValueOnce(new Error('storage unavailable'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(getStoredToken()).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('setUserToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('유효한 토큰이면 저장하고 true 를 반환한다', async () => {
    const storage = stubChromeStorage()

    await expect(setUserToken(VALID_TOKEN)).resolves.toBe(true)
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(VALID_TOKEN)
  })

  it('형식 위반이면 저장하지 않고 false 를 반환한다', async () => {
    const storage = stubChromeStorage()

    await expect(setUserToken('nope')).resolves.toBe(false)
    expect(storage.set).not.toHaveBeenCalled()
    expect(storage.store.has(TOKEN_STORAGE_KEY)).toBe(false)
  })

  it('저장 후 getStoredToken 과 왕복 일치한다', async () => {
    stubChromeStorage()

    await expect(setUserToken(VALID_TOKEN)).resolves.toBe(true)
    await expect(getStoredToken()).resolves.toBe(VALID_TOKEN)
  })

  it('저장이 실패하면 warn 후 false 를 반환한다', async () => {
    const storage = stubChromeStorage()
    storage.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(setUserToken(VALID_TOKEN)).resolves.toBe(false)
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('maskToken', () => {
  it('정상 토큰은 sc_<body앞4>…<sig뒤4> 로 마스킹한다', () => {
    expect(maskToken(VALID_TOKEN)).toBe('sc_AAAA…BBBB')
  })

  it('마스킹은 원문 전체를 절대 포함하지 않는다 (노출 회귀 그물)', () => {
    const masked = maskToken(VALID_TOKEN)
    expect(masked).not.toContain('.')          // 점이 …로 바뀌므로 원문 형태와 다르다
    expect(VALID_TOKEN.startsWith(masked)).toBe(false)
    expect(masked.length).toBeLessThan(VALID_TOKEN.length)
  })

  it('짧거나 비정상 입력도 throw 없이 안전하게 처리한다', () => {
    expect(() => maskToken('sc_a.b')).not.toThrow()
    expect(maskToken('sc_a.b')).toBe('sc_a…b')
    expect(() => maskToken('sc_')).not.toThrow()   // 방어적 — 게이트 통과분 전제지만
  })
})
