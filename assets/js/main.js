// Frontend behavior script for GitHub Pages static site
// NOTE: Gemini API key is never used here.
// All AI calls go through Cloudflare Worker endpoint only.

const WORKER_URL = 'https://wild-snowflake-f059.coorocket.workers.dev/analyze';

document.addEventListener('DOMContentLoaded', () => {
    initScrollReveal();
    initFAQ();
    initTabs();
    initMobileMenu();
    initContactForm();
});

function initScrollReveal() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.scroll-reveal').forEach((el) => observer.observe(el));
}

function initFAQ() {
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach((btn) => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.faq-item');
            const wasActive = item.classList.contains('active');

            document.querySelectorAll('.faq-item').forEach((faqItem) => {
                faqItem.classList.remove('active');
                const answer = faqItem.querySelector('.faq-answer');
                if (answer) {
                    answer.style.maxHeight = null;
                }
            });

            if (!wasActive) {
                item.classList.add('active');
                const answer = item.querySelector('.faq-answer');
                if (answer) {
                    answer.style.maxHeight = `${answer.scrollHeight}px`;
                }
            }
        });
    });
}

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn[data-tab-target]');
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tabTarget, button);
        });
    });
}

function initMobileMenu() {
    const menuButton = document.querySelector('.mobile-menu-btn');
    const nav = document.getElementById('primaryNav');

    if (!menuButton || !nav) {
        return;
    }

    const closeMenu = () => {
        nav.classList.remove('is-open');
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.setAttribute('aria-label', '메뉴 열기');
    };

    const openMenu = () => {
        nav.classList.add('is-open');
        menuButton.setAttribute('aria-expanded', 'true');
        menuButton.setAttribute('aria-label', '메뉴 닫기');
    };

    menuButton.addEventListener('click', () => {
        const isOpen = nav.classList.contains('is-open');
        if (isOpen) {
            closeMenu();
            return;
        }
        openMenu();
    });

    nav.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', closeMenu);
    });

    window.addEventListener('click', (event) => {
        if (!nav.classList.contains('is-open')) {
            return;
        }

        if (!nav.contains(event.target) && !menuButton.contains(event.target)) {
            closeMenu();
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            closeMenu();
        }
    });
}

function initContactForm() {
    const contactForm = document.getElementById('contactForm');
    const successOverlay = document.getElementById('successOverlay');

    if (!contactForm || !successOverlay) {
        return;
    }

    contactForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const submitBtn = event.target.querySelector('.submit-btn');
        const originalBtnText = submitBtn.innerText;

        submitBtn.innerText = '전송 중...';
        submitBtn.disabled = true;

        const scriptURL = 'https://script.google.com/macros/s/AKfycby8AdQ6gR-OM9wpqR-3pYxt7HfDnAznp9UQ0Hn1hvuDMlyHgFEOJ6FP1cSYyNh35b1b/exec';
        const formData = new FormData(event.target);
        const params = new URLSearchParams();

        const countries = Array.from(event.target.querySelectorAll('input[name="country"]:checked'))
            .map((el) => el.parentElement.innerText.trim())
            .join(', ');

        params.append('brandUrl', formData.get('brandUrl'));
        params.append('name', formData.get('name'));
        params.append('company', formData.get('company'));
        params.append('email', formData.get('email'));
        params.append('tel', formData.get('tel'));
        params.append('country', countries);
        params.append('message', formData.get('message'));

        fetch(scriptURL, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        })
            .then(() => {
                successOverlay.style.display = 'flex';
                contactForm.reset();
            })
            .catch((error) => {
                console.error('Fetch error:', error);
                setTimeout(() => {
                    successOverlay.style.display = 'flex';
                    contactForm.reset();
                }, 500);
            })
            .finally(() => {
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            });
    });
}

function safeJsonParse(input) {
    if (typeof input !== 'string') {
        return null;
    }

    try {
        return JSON.parse(input);
    } catch {
        return null;
    }
}

function normalizeList(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(/\n|,|•|\-|\*/g)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
}

function pickScanPayload(data) {
    if (!data || typeof data !== 'object') {
        return null;
    }

    if ('keywords' in data || 'platforms' in data || 'strategy' in data) {
        return data;
    }

    if (data.result && typeof data.result === 'object') {
        return data.result;
    }

    if (data.data && typeof data.data === 'object') {
        return data.data;
    }

    return data;
}

function renderListToText(list) {
    if (!list.length) {
        return '데이터 분석 불가';
    }

    return list.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

// Global function (kept intentionally for inline onclick in index.html)
async function analyzeMarket() {
    const product = document.getElementById('productInput').value.trim();
    const country = document.getElementById('targetCountry').value;
    const loader = document.getElementById('aiLoader');
    const resultBox = document.getElementById('aiResult');
    const keywordsEl = document.getElementById('resultKeywords');
    const platformsEl = document.getElementById('resultPlatforms');
    const strategyEl = document.getElementById('resultStrategy');

    if (!product) {
        alert('제품명을 입력해 주세요.');
        return;
    }

    loader.style.display = 'block';
    resultBox.style.display = 'none';

    try {
        const resp = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product, country })
        });

        const rawText = await resp.text();
        const rawPreview = (rawText || '').replace(/\s+/g, ' ').trim().slice(0, 300);

        // 1) safeJsonParse 우선
        let parsed = safeJsonParse(rawText);
        // 2) safeJsonParse 실패 시 JSON.parse 재시도
        if (!parsed) {
            try {
                parsed = JSON.parse(rawText);
            } catch {
                parsed = null;
            }
        }

        const payload = parsed ? pickScanPayload(parsed) : null;

        if (!resp.ok) {
            let detailText = '';
            if (payload && typeof payload === 'object') {
                if (typeof payload.details === 'string' && payload.details.trim()) {
                    detailText = payload.details.trim();

                    // details 안에 JSON 문자열이 들어있는 경우 실제 message를 추출
                    const detailsJson = safeJsonParse(detailText);
                    if (detailsJson?.error?.message && typeof detailsJson.error.message === 'string') {
                        detailText = detailsJson.error.message.trim();
                    }
                }

                if (!detailText && typeof payload.message === 'string' && payload.message.trim()) {
                    detailText = payload.message.trim();
                }

                if (!detailText && typeof payload.error === 'string' && payload.error.trim()) {
                    detailText = payload.error.trim();
                }
            }

            // Parse retry seconds from quota error text:
            // e.g. "Please retry in 42.218702404s."
            let retryHint = '';
            const retryMatch = detailText.match(/Please\\s+retry\\s+in\\s+([0-9]+(?:\\.[0-9]+)?)s\\.?/i);
            if (retryMatch && retryMatch[1]) {
                const waitSec = Math.max(1, Math.ceil(Number(retryMatch[1])));
                retryHint = ` (약 ${waitSec}초 후 재시도)`;
            }

            const errorMsg = detailText
                ? `서버 오류: ${detailText}${retryHint}`
                : `서버 오류: 요청 실패 (HTTP ${resp.status})`;

            console.error('Worker error:', resp.status, rawText);
            keywordsEl.innerText = '분석 결과 없음';
            platformsEl.innerText = '분석 결과 없음';
            strategyEl.innerText = errorMsg;
            console.debug('[AI Scanner] error response', {
                status: resp.status,
                rawText: rawPreview || '(empty)',
            });
            loader.style.display = 'none';
            resultBox.style.display = 'block';
            alert(errorMsg);
            return;
        }

        const keywords = normalizeList(payload ? payload.keywords : []);
        const platforms = normalizeList(payload ? payload.platforms : []);
        const strategy = payload && typeof payload.strategy === 'string'
            ? payload.strategy.trim()
            : '';

        keywordsEl.innerText = keywords.length ? renderListToText(keywords) : '분석 결과 없음';
        platformsEl.innerText = platforms.length ? renderListToText(platforms) : '분석 결과 없음';
        strategyEl.innerText = strategy || '분석 결과 없음';
        console.debug('[AI Scanner] success response', {
            status: resp.status,
            parsed: parsed || null,
            rawText: rawPreview || '(empty)',
        });

        loader.style.display = 'none';
        resultBox.style.display = 'block';
    } catch (error) {
        console.error('Analyze error:', error);
        loader.style.display = 'none';
        alert('분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    }
}

function resetContactForm() {
    const successOverlay = document.getElementById('successOverlay');
    if (successOverlay) {
        successOverlay.style.display = 'none';
    }
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach((content) => content.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));

    const target = document.getElementById(tabId);
    if (target) {
        target.classList.add('active');
    }

    if (element) {
        element.classList.add('active');
    }
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
    }
}

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.style.display = 'none';
    }
});
