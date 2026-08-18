// Frontend behavior script for GitHub Pages static site
// NOTE: Gemini API key is never used here.
// All AI calls go through Cloudflare Worker endpoint only.

const WORKER_BASE_URL = 'https://wild-snowflake-f059.coorocket.workers.dev';
const WORKER_URL = `${WORKER_BASE_URL}/analyze`;
const CONTACT_URL = `${WORKER_BASE_URL}/contact`;
const ANALYTICS_EVENT_URL = `${WORKER_BASE_URL}/analytics-event`;
const BLOG_POSTS_URL = `${WORKER_BASE_URL}/blog-posts`;
const BLOG_IMAGE_URL = `${WORKER_BASE_URL}/blog-image`;
const BLOG_HOME_URL = 'https://blog.naver.com/forzeus';
const BLOG_IMAGE_FALLBACKS = [
    'assets/images/blog-cross-border.webp',
    'assets/images/blog-market-data.webp',
    'assets/images/blog-partnership.webp'
];

document.addEventListener('DOMContentLoaded', () => {
    initScrollReveal();
    initFAQ();
    initTabs();
    initMobileMenu();
    initBlogCarousel();
    initContactForm();
    initConversionTracking();
});

function trackConversion(eventName, label = '') {
    const payload = JSON.stringify({
        event: eventName,
        path: window.location.pathname,
        label: String(label || '').slice(0, 80)
    });

    if (navigator.sendBeacon) {
        const queued = navigator.sendBeacon(
            ANALYTICS_EVENT_URL,
            new Blob([payload], { type: 'text/plain;charset=UTF-8' })
        );
        if (queued) {
            return;
        }
    }

    fetch(ANALYTICS_EVENT_URL, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: payload
    }).catch(() => {
        // Measurement must never interrupt the visitor's main task.
    });
}

function initConversionTracking() {
    trackConversion('page_view');

    document.addEventListener('click', (event) => {
        const target = event.target.closest('[data-track], .blog-card');
        if (!target) {
            return;
        }

        const eventName = target.dataset.track || 'blog_click';
        const serviceInterest = target.dataset.serviceInterest || '';
        if (serviceInterest) {
            const serviceSelect = document.getElementById('serviceInterest');
            if (serviceSelect) {
                serviceSelect.value = serviceInterest;
            }
        }
        trackConversion(eventName, serviceInterest);
    });

    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('focusin', () => {
            if (contactForm.dataset.started === 'true') {
                return;
            }
            contactForm.dataset.started = 'true';
            trackConversion('contact_form_start');
        });
    }
}

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

function initBlogCarousel() {
    const track = document.getElementById('blogCarousel');
    const previousButton = document.querySelector('.blog-carousel-prev');
    const nextButton = document.querySelector('.blog-carousel-next');
    const status = document.getElementById('blogCarouselStatus');
    const section = track?.closest('.insight-part2');

    if (!track || !previousButton || !nextButton || !status || !section) {
        return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let autoRotateId = null;
    let livePostsLoaded = false;
    let loadStarted = false;
    let sectionIsVisible = false;

    const getCardStep = () => {
        const firstCard = track.querySelector('.blog-card');
        if (!firstCard) {
            return track.clientWidth;
        }

        const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0;
        return firstCard.getBoundingClientRect().width + gap;
    };

    const moveCarousel = (direction, behavior = reducedMotion ? 'auto' : 'smooth') => {
        const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
        const edgeTolerance = 4;

        if (direction > 0 && track.scrollLeft >= maxScrollLeft - edgeTolerance) {
            track.scrollTo({ left: 0, behavior });
            return;
        }

        if (direction < 0 && track.scrollLeft <= edgeTolerance) {
            track.scrollTo({ left: maxScrollLeft, behavior });
            return;
        }

        track.scrollBy({ left: direction * getCardStep(), behavior });
    };

    const stopAutoRotate = () => {
        if (autoRotateId !== null) {
            window.clearInterval(autoRotateId);
            autoRotateId = null;
        }
    };

    const startAutoRotate = () => {
        stopAutoRotate();
        if (reducedMotion || !livePostsLoaded || !sectionIsVisible || document.hidden) {
            return;
        }

        autoRotateId = window.setInterval(() => moveCarousel(1), 5500);
    };

    previousButton.addEventListener('click', () => {
        moveCarousel(-1);
        startAutoRotate();
    });

    nextButton.addEventListener('click', () => {
        moveCarousel(1);
        startAutoRotate();
    });

    track.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            moveCarousel(event.key === 'ArrowRight' ? 1 : -1);
            startAutoRotate();
        }
    });

    track.addEventListener('pointerenter', stopAutoRotate);
    track.addEventListener('pointerleave', startAutoRotate);
    track.addEventListener('focusin', stopAutoRotate);
    track.addEventListener('focusout', startAutoRotate);
    track.addEventListener('pointerdown', stopAutoRotate);
    track.addEventListener('pointerup', startAutoRotate);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAutoRotate();
            return;
        }
        startAutoRotate();
    });

    const loadRecentPosts = async () => {
        if (loadStarted) {
            return;
        }
        loadStarted = true;

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 8000);

        try {
            const response = await fetch(BLOG_POSTS_URL, {
                method: 'GET',
                cache: 'default',
                credentials: 'omit',
                headers: { Accept: 'application/json' },
                signal: controller.signal
            });
            const payload = safeJsonParse(await response.text());
            const posts = Array.isArray(payload?.posts) ? payload.posts.slice(0, 8) : [];

            if (!response.ok || posts.length === 0) {
                throw new Error(payload?.error || `블로그 목록 요청 실패 (HTTP ${response.status})`);
            }

            const fragment = document.createDocumentFragment();
            posts.forEach((post, index) => fragment.appendChild(createBlogCard(post, index)));
            track.replaceChildren(fragment);
            track.dataset.liveState = 'ready';
            track.scrollLeft = 0;
            livePostsLoaded = true;
            status.innerText = `네이버 블로그의 최근 포스팅 ${posts.length}개를 표시했습니다.`;
            startAutoRotate();
        } catch (error) {
            console.warn('Recent blog posts could not be refreshed:', error);
            track.dataset.liveState = 'fallback';
            status.innerText = '최신 글을 불러오지 못해 확인된 네이버 블로그 글을 표시합니다.';
        } finally {
            window.clearTimeout(timeoutId);
        }
    };

    if ('IntersectionObserver' in window) {
        const rotationObserver = new IntersectionObserver((entries) => {
            sectionIsVisible = entries.some((entry) => entry.isIntersecting);
            if (sectionIsVisible) {
                startAutoRotate();
                return;
            }
            stopAutoRotate();
        }, { threshold: 0.2 });
        rotationObserver.observe(section);

        const loaderObserver = new IntersectionObserver((entries, observer) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                observer.disconnect();
                loadRecentPosts();
            }
        }, { rootMargin: '500px 0px' });
        loaderObserver.observe(section);
    } else {
        sectionIsVisible = true;
        loadRecentPosts();
    }
}

function createBlogCard(post, index) {
    const fallbackImage = BLOG_IMAGE_FALLBACKS[index % BLOG_IMAGE_FALLBACKS.length];
    const card = document.createElement('a');
    const thumb = document.createElement('div');
    const image = document.createElement('img');
    const info = document.createElement('div');
    const badge = document.createElement('span');
    const title = document.createElement('h4');
    const date = document.createElement('time');
    const publishedDate = formatBlogDate(post?.publishedAt);
    const postUrl = normalizeBlogPostUrl(post?.url);
    const thumbnailUrl = typeof post?.thumbnail === 'string' ? post.thumbnail.trim() : '';

    card.className = 'blog-card';
    card.dataset.track = 'blog_click';
    card.href = postUrl;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    thumb.className = 'blog-thumb';
    image.className = 'blog-thumb-img';
    image.alt = '';
    image.width = 720;
    image.height = 480;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.src = thumbnailUrl
        ? `${BLOG_IMAGE_URL}?src=${encodeURIComponent(thumbnailUrl)}`
        : fallbackImage;
    image.addEventListener('error', () => {
        if (image.dataset.fallbackApplied === 'true') {
            return;
        }
        image.dataset.fallbackApplied = 'true';
        image.src = fallbackImage;
    });

    info.className = 'blog-info';
    badge.className = 'naver-badge';
    badge.textContent = typeof post?.category === 'string' && post.category.trim()
        ? post.category.trim()
        : 'CMD.BLOG';
    title.className = 'blog-title';
    title.textContent = typeof post?.title === 'string' && post.title.trim()
        ? post.title.trim()
        : '네이버 블로그 포스팅';
    date.className = 'blog-date';
    date.dateTime = publishedDate.iso;
    date.textContent = publishedDate.label;

    thumb.appendChild(image);
    info.append(badge, title, date);
    card.append(thumb, info);
    return card;
}

function normalizeBlogPostUrl(value) {
    try {
        const url = new URL(String(value || ''), BLOG_HOME_URL);
        if (url.protocol === 'https:' &&
            url.hostname === 'blog.naver.com' &&
            /^\/forzeus\/\d+\/?$/.test(url.pathname)) {
            return url.href;
        }
    } catch {
        // Use the verified blog home URL below.
    }
    return BLOG_HOME_URL;
}

function formatBlogDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return { iso: '', label: '' };
    }

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value || '';
    const month = parts.find((part) => part.type === 'month')?.value || '';
    const day = parts.find((part) => part.type === 'day')?.value || '';
    return {
        iso: `${year}-${month}-${day}`,
        label: `${year}.${month}.${day}`
    };
}

function initContactForm() {
    const contactForm = document.getElementById('contactForm');
    const successOverlay = document.getElementById('successOverlay');
    const formStatus = document.getElementById('contactFormStatus');

    if (!contactForm || !successOverlay || !formStatus) {
        return;
    }

    const countryError = document.getElementById('countryError');
    contactForm.querySelectorAll('input[name="country"]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            if (countryError) {
                countryError.innerText = '';
            }
        });
    });

    contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitBtn = event.target.querySelector('.submit-btn');
        const originalBtnText = submitBtn.innerText;
        const formData = new FormData(event.target);
        const countries = Array.from(event.target.querySelectorAll('input[name="country"]:checked'))
            .map((el) => el.value);

        if (countries.length === 0) {
            if (countryError) {
                countryError.innerText = '진출 희망 국가를 한 곳 이상 선택해 주세요.';
            }
            event.target.querySelector('input[name="country"]')?.focus();
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 15000);

        submitBtn.innerText = '전송 중...';
        submitBtn.disabled = true;
        formStatus.className = 'form-status';
        formStatus.innerText = '문의 내용을 안전하게 전송하고 있습니다.';
        trackConversion('contact_submit');

        try {
            const response = await fetch(CONTACT_URL, {
                method: 'POST',
                cache: 'no-store',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    brandUrl: formData.get('brandUrl'),
                    serviceInterest: formData.get('serviceInterest'),
                    marketStage: formData.get('marketStage'),
                    name: formData.get('name'),
                    company: formData.get('company'),
                    email: formData.get('email'),
                    tel: formData.get('tel'),
                    countries,
                    message: formData.get('message'),
                    privacyConsent: formData.get('privacyConsent') === 'on',
                    website: formData.get('website') || ''
                }),
                signal: controller.signal
            });

            const rawText = await response.text();
            const payload = safeJsonParse(rawText);

            if (!response.ok || payload?.ok !== true) {
                throw new Error(payload?.error || `문의 접수 확인 실패 (HTTP ${response.status})`);
            }

            formStatus.className = 'form-status success';
            formStatus.innerText = '문의 접수가 확인되었습니다.';
            successOverlay.style.display = 'flex';
            contactForm.reset();
            contactForm.dataset.started = 'false';
            trackConversion('contact_success');
        } catch (error) {
            const isTimeout = error?.name === 'AbortError';
            console.error('Contact submission error:', error);
            formStatus.className = 'form-status error';
            formStatus.innerHTML = isTimeout
                ? '응답 시간이 초과되었습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도하거나 <a href="mailto:cmdlabkr@gmail.com">이메일로 문의해 주세요.</a>'
                : '문의 접수를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도하거나 <a href="mailto:cmdlabkr@gmail.com">이메일로 문의해 주세요.</a>';
            trackConversion('contact_error');
        } finally {
            window.clearTimeout(timeoutId);
            submitBtn.innerText = originalBtnText;
            submitBtn.disabled = false;
        }
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
    trackConversion('ai_scan_start');

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
            trackConversion('ai_scan_error');
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
        trackConversion('ai_scan_success');
    } catch (error) {
        console.error('Analyze error:', error);
        loader.style.display = 'none';
        trackConversion('ai_scan_error');
        alert('분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    }
}

function resetContactForm() {
    const successOverlay = document.getElementById('successOverlay');
    const formStatus = document.getElementById('contactFormStatus');
    if (successOverlay) {
        successOverlay.style.display = 'none';
    }
    if (formStatus) {
        formStatus.className = 'form-status';
        formStatus.innerText = '';
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
