import { beforeEach } from 'vitest'
import { resetTokenRateLimitForTests } from '../src/token-rate-limit'
import { resetUploadRateLimitForTests } from '../src/upload-rate-limit'

// rate-limit 카운터는 모듈 전역 Map 이라 테스트 간(그리고 isolate:false 시 파일 간)
// 상태가 샌다. 매 테스트 전 두 리미터를 전역 리셋해, CF-Connecting-IP 미설정 업로드가
// 공유하는 'unknown' 버킷이 한 파일에서 20 을 넘겨 무관한 테스트를 429 로 뒤집는
// 시한폭탄을 원천 차단한다. (개별 파일의 명시적 reset 훅과 idempotent 하게 중복돼도 무해)
beforeEach(() => {
  resetTokenRateLimitForTests()
  resetUploadRateLimitForTests()
})
