/*
  자바스크립트(JS) 설명:
  이 파일은 웹페이지의 동적인 기능(스크롤 애니메이션, 카카오톡 알림)을 담당합니다.
  기존의 복잡한 폼 예약 로직은 제거하고, 버튼 클릭 시 카카오 채널로 유도하도록 변경했습니다.
*/

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. 네비게이션 바 배경 변화 (스크롤 감지)
    const navbar = document.getElementById('navbar');
    
    if (navbar) {
        window.addEventListener('scroll', () => {
            // 스크롤이 50px 이상 내려가면 'scrolled' 클래스 추가
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }

    // 2. 부드러운 스크롤 등장 애니메이션 (Intersection Observer)
    const fadeElements = document.querySelectorAll('.fade-in');

    const appearOptions = {
        threshold: 0.15, 
        rootMargin: "0px 0px -50px 0px"
    };

    const appearOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, appearOptions);

    fadeElements.forEach(element => {
        appearOnScroll.observe(element);
    });

    // 4. FMS 동영상 모달 팝업 로직
    const fmsItems = document.querySelectorAll('.fms-item');
    const modal = document.getElementById('video-modal');
    const modalTitle = document.getElementById('modal-title');
    const fmsVideo = document.getElementById('fms-video');
    const closeModalBtn = document.getElementById('close-modal');

    fmsItems.forEach(item => {
        item.addEventListener('click', () => {
            const videoUrl = item.getAttribute('data-video');
            const title = item.getAttribute('data-title');
            
            if (videoUrl && modal && fmsVideo) {
                modalTitle.textContent = title;
                // 최근 브라우저 보안 정책상 음소거(mute=1)가 없으면 자동 재생이 차단될 수 있습니다.
                fmsVideo.src = videoUrl + "?autoplay=1&mute=1"; 
                modal.classList.add('show');
            }
        });
    });

    // 모달 닫기 (X 버튼)
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            modal.classList.remove('show');
            fmsVideo.src = ''; // 비디오 재생 중지
        });
    }

    // 모달 바깥 (검은 배경) 영역 클릭 시 닫기
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            fmsVideo.src = ''; // 비디오 재생 중지
        }
    });

});
