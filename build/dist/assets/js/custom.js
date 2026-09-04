jQuery( document ).ready(function( $ ) {
	"use strict";

    // Initial settings
    var settings = {
        defaultHeaderMT: $("header .navbar-brand").css("margin-top"), // default header margin top
        defaultFilterH: $(".product-filters").css("height"), // default product-filter height
        isSmallHeader: false,
        lastScrollPos: $(window).scrollTop(), // last scroll position
        isScrollUp: false,
        isScrollDown: false,
        isFilterSticky: false,
        isFilterHidden: false,
    }

    $("header .navbar-brand").css("transition", "all 0.5s");
    $(".product-filters").css("transition", "all 0.5s");
    $(".product-filters-placeholder").css("transition", "all 0.5s");
    $(".product-filters-placeholder").css("height", settings.defaultFilterH);

    $(function() {
        $( "#tabs" ).tabs();
    });

    $("#preloader").animate({
        'opacity': '0'
    }, 600, function(){
        setTimeout(function(){
            $("#preloader").css("visibility", "hidden").fadeOut();
        }, 300);
    });
    
    // Scroll Event
    $(window).scroll(function() {
      var scroll = $(window).scrollTop();
      var box = $('.header-text').height();
      var header = $('header').height();

      if (scroll > settings.lastScrollPos) {
        settings.isScrollDown = true;
        settings.isScrollUp = false;
        settings.lastScrollPos = scroll;
        //console.log('scroll down');
      } else {
        settings.isScrollDown = false;
        settings.isScrollUp = true;
        settings.lastScrollPos = scroll;
        //console.log('scroll up');
      }

      if ($(".product-filters").hasClass("sticky")) {
        settings.isFilterSticky = true;
      } else {
        settings.isFilterSticky = false;
      }

      // Checks if scrolling passed the header
      if (scroll >= box - header) {
        $("header").addClass("background-header");
        if (!settings.isSmallHeader) { smallHeader(); }

      } else {
        $("header").removeClass("background-header");
        if (settings.isSmallHeader) { defaultHeader(); }
      }

      if (settings.isFilterSticky && settings.isScrollDown) {
        if (!settings.isFilterHidden) { hideFilter(); }
      } else if (settings.isFilterSticky && settings.isScrollUp) {
        if (settings.isFilterHidden) { showFilter(); }
      } else {

      }

      
    });

	if ($('.owl-testimonials').length) {
        $('.owl-testimonials').owlCarousel({
            loop: true,
            nav: false,
            dots: true,
            items: 1,
            margin: 30,
            autoplay: false,
            smartSpeed: 700,
            autoplayTimeout: 6000,
            responsive: {
                0: {
                    items: 1,
                    margin: 0
                },
                460: {
                    items: 1,
                    margin: 0
                },
                576: {
                    items: 2,
                    margin: 20
                },
                992: {
                    items: 2,
                    margin: 30
                }
            }
        });
    }

    $(".Modern-Slider").slick({
        autoplay:true,
        autoplaySpeed:10000,
        speed:600,
        slidesToShow:1,
        slidesToScroll:1,
        pauseOnHover:false,
        dots:true,
        pauseOnDotsHover:true,
        cssEase:'linear',
       // fade:true,
        draggable:false,
        prevArrow:'<button class="PrevArrow"></button>',
        nextArrow:'<button class="NextArrow"></button>', 
    });

    /** Makes the header smaller **/
    function smallHeader() {
        //console.log('smallHeader');
        $("header .navbar-brand").css("margin-top", 0);
        settings.isSmallHeader = true;
    }
    
    /** Reverts to the header's default **/
    function defaultHeader () {
        //console.log('defaultHeader');
        $("header .navbar-brand").css("margin-top", settings.defaultHeaderMT);
        settings.isSmallHeader = false;
    }

    /** Shows product filter **/
    function showFilter() {
        console.log('showFilter');
        $(".product-filters").css("transform", "translateY(0px)");
        $(".product-filters-placeholder").css("transform", "translateY(0px)");
        //$(".product-filters").css("opacity", 1);
        settings.isFilterHidden = false;
    }
    
    /** Hides product filter **/
    function hideFilter() {
        console.log('hideFilter');
        $(".product-filters").css("transform", "translateY(-135px)");
        $(".product-filters-placeholder").css("transform", "translateY(-135px)");
        //$(".product-filters").css("opacity", 0);
        settings.isFilterHidden = true;
    }
    
});