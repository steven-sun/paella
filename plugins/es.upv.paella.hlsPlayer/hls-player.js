
(() => {

	let s_preventVideoDump = [];

	class HLSPlayer extends paella.Html5Video {
		get config() {
			let config = {
				autoStartLoad: true,
				startPosition : -1,
				capLevelToPlayerSize: true,
				debug: false,
				defaultAudioCodec: undefined,
				initialLiveManifestSize: 1,
				maxBufferLength: 30,
				maxMaxBufferLength: 600,
				maxBufferSize: 60*1000*1000,
				maxBufferHole: 0.5,
				lowBufferWatchdogPeriod: 0.5,
				highBufferWatchdogPeriod: 3,
				nudgeOffset: 0.1,
				nudgeMaxRetry : 3,
				maxFragLookUpTolerance: 0.2,
				liveSyncDurationCount: 3,
				liveMaxLatencyDurationCount: 10,
				enableWorker: true,
				enableSoftwareAES: true,
				manifestLoadingTimeOut: 10000,
				manifestLoadingMaxRetry: 1,
				manifestLoadingRetryDelay: 500,
				manifestLoadingMaxRetryTimeout : 64000,
				startLevel: undefined,
				levelLoadingTimeOut: 10000,
				levelLoadingMaxRetry: 4,
				levelLoadingRetryDelay: 500,
				levelLoadingMaxRetryTimeout: 64000,
				fragLoadingTimeOut: 20000,
				fragLoadingMaxRetry: 6,
				fragLoadingRetryDelay: 500,
				fragLoadingMaxRetryTimeout: 64000,
				startFragPrefetch: false,
				appendErrorMaxRetry: 3,
				
				// loader: customLoader,
				// fLoader: customFragmentLoader,
				// pLoader: customPlaylistLoader,
				// xhrSetup: XMLHttpRequestSetupCallback,
				// fetchSetup: FetchSetupCallback,
				// abrController: customAbrController,
				// timelineController: TimelineController,

				enableWebVTT: true,
				enableCEA708Captions: true,
				stretchShortVideoTrack: false,
				maxAudioFramesDrift : 1,
				forceKeyFrameOnDiscontinuity: true,
				abrEwmaFastLive: 5.0,
				abrEwmaSlowLive: 9.0,
				abrEwmaFastVoD: 4.0,
				abrEwmaSlowVoD: 15.0,
				abrEwmaDefaultEstimate: 500000,
				abrBandWidthFactor: 0.95,
				abrBandWidthUpFactor: 0.7,
				minAutoBitrate: 0
			};

			let pluginConfig = {};
			paella.player.config.player.methods.some((methodConfig) => {
				if (methodConfig.factory=="HLSVideoFactory") {
					pluginConfig = methodConfig.config || {};
					return true;
				}
			});

			for (let key in config) {
				if (pluginConfig[key]!=undefined) {
					config[key] = pluginConfig[key];
				}
			}

			return config;
		}

		constructor(id,stream,left,top,width,height) {
			super(id,stream,left,top,width,height,'hls');
		}
		
		_loadDeps() {
			return new Promise((resolve,reject) => {
				if (!window.$paella_hls) {
					require([paella.baseUrl +'resources/deps/hls.min.js'],function(hls) {
						window.$paella_hls = hls;
						resolve(window.$paella_hls);
					});
				}
				else {
					resolve(window.$paella_hls);
				}	
			});
		}
	
		_deferredAction(action) {
			return new Promise((resolve,reject) => {
				function processResult(actionResult) {
					if (actionResult instanceof Promise) {
						actionResult.then((p) => resolve(p))
							.catch((err) => reject(err));
					}
					else {
						resolve(actionResult);
					}
				}
	
				if (this.ready) {
					processResult(action());
				}
				else {
					let eventFunction = () => {
						processResult(action());
						$(this.video).unbind('canplay');
						$(this.video).unbind('loadedmetadata');
						if (timer) {
							clearTimeout(timer);
							timer = null;
						}
					};
					$(this.video).bind('canplay',eventFunction);
					$(this.video).bind('loadedmetadata',eventFunction);
					let timerFunction = () => {
						if (!this.ready) {
							console.debug("HLS video resume failed. Trying to recover.");
							if (this._hls) {
								this._hls.recoverMediaError();
							}
							else {
								// iOS
								// In this way the recharge is forced, and it is possible to recover errors.
								let src = this.video.innerHTML;
								this.video.innerHTML = "";
								this.video.innerHTML = src;
								this.video.load();
								this.video.play();
							}
							timer = setTimeout(timerFunction, 1000);
						}
						else {
							eventFunction();
						}
					}
					let timer = setTimeout(timerFunction, 1000);
				}
			});
		}

		setupHls(video,url) {
			let initialQualityLevel = this.config.initialQualityLevel !== undefined ? this.config.initialQualityLevel : 1;
			return new Promise((resolve,reject) => {
				this._loadDeps()
					.then((Hls) => {
						if (Hls.isSupported()) {
							let cfg = this.config;
							//cfg.autoStartLoad = false;
							this._hls = new Hls(cfg);
							this._hls.loadSource(url);
							this._hls.attachMedia(video);
							this.autoQuality = true;

							this._hls.on(Hls.Events.LEVEL_SWITCHED, (ev,data) => {
								this._qualities = this._qualities || [];
								this._qualityIndex = this.autoQuality ? this._qualities.length - 1 : data.level;
								paella.events.trigger(paella.events.qualityChanged,{});
								if (console && console.log) console.log(`HLS: quality level changed to ${ data.level }`);
							});

							this._hls.on(Hls.Events.ERROR, (event, data) => {
								if (data.fatal) {
									switch (data.type) {
									case Hls.ErrorTypes.NETWORK_ERROR:
										console.error("paella.HLSPlayer: Fatal network error encountered, try to recover");
										this._hls.startLoad();
										break;
									case Hls.ErrorTypes.MEDIA_ERROR:
										console.error("paella.HLSPlayer: Fatal media error encountered, try to recover");
										this._hls.recoverMediaError();
										break;
									default:
										console.error("paella.HLSPlayer: Fatal error. Can not recover");
										this._hls.destroy();
										reject(new Errro("Invalid media"));
										break;
									}
								}
							});

							this._hls.on(Hls.Events.MANIFEST_PARSED, () => {
								if (!cfg.autoStartLoad) {
									this._hls.startLoad();
								}
								// Fixes hls.js problems when loading the initial quality level
								this._hls.currentLevel = this._hls.levels.length>=initialQualityLevel ? initialQualityLevel : -1;
								setTimeout(() => this._hls.currentLevel = -1, 1000);
								
								resolve(video);
							});
						}
						else {
							reject(new Error("HLS not supported"));
						}
					})
			});
		}

		webGlDidLoad() {
			if (base.userAgent.system.iOS) {
				return super.webGlDidLoad();
			}
			// Register a new video loader in the webgl engine, to enable the
			// hls compatibility in webgl canvas
			bg.utils.HTTPResourceProvider.AddVideoLoader('m3u8', (url,onSuccess,onFail) => {
				var video = document.createElement("video");
				s_preventVideoDump.push(video);
				this.setupHls(video,url)
					.then(() => onSuccess(video))
					.catch(() => onFail());
			});
			return Promise.resolve();
		}

		loadVideoStream(canvasInstance,stream) {
			if (base.userAgent.system.iOS) {
				return super.loadVideoStream(canvasInstance,stream);
			}

			return canvasInstance.loadVideo(this,stream,(videoElem) => {
				return this.setupHls(videoElem,stream.src);
			});
		}
	
		getQualities() {
			if (base.userAgent.system.iOS)// ||
		//		base.userAgent.browser.Safari)
			{
				return new Promise((resolve,reject) => {
					resolve([
						{
							index: 0,
							res: "",
							src: "",
							toString:function() { return "auto"; },
							shortLabel:function() { return "auto"; },
							compare:function(q2) { return 0; }
						}
					]);
				});
			}
			else {
				let This = this;
				return new Promise((resolve) => {
					if (!this._qualities || this._qualities.length==0) {
						This._qualities = [];
						This._hls.levels.forEach(function(q, index){
							This._qualities.push(This._getQualityObject(index, {
								index: index,
								res: { w:q.width, h:q.height },
								bitrate: q.bitrate
							}));					
						});
						if (this._qualities.length>1) {
							// If there is only one quality level, don't add the "auto" option
							This._qualities.push(
								This._getQualityObject(This._qualities.length, {
									index:This._qualities.length,
									res: { w:0, h:0 },
									bitrate: 0
								}));
						}
					}
					This.qualityIndex = This._qualities.length - 1;
					resolve(This._qualities);
				});
			}
		}

		disable(isMainAudioPlayer) {
			if (base.userAgent.system.iOS) {
				return;
			}
			
			this._currentQualityIndex = this._qualityIndex;
			this._hls.currentLevel = 0;
		}
	
		enable(isMainAudioPlayer) {
			if (this._currentQualityIndex !== undefined && this._currentQualityIndex !== null) {
				this.setQuality(this._currentQualityIndex);
				this._currentQualityIndex = null;
			}
		}

		printQualityes() {
			return new Promise((resolve,reject) => {
				this.getCurrentQuality()
					.then((cq)=>{
						return this.getNextQuality();
					})
					.then((nq) => {
						resolve();
					})
			});		
		}
		
		setQuality(index) {
			if (base.userAgent.system.iOS)// ||
				//base.userAgent.browser.Safari)
			{
				return Promise.resolve();
			}
			else if (index!==null) {
				try {
					this.qualityIndex = index;
					let level = index;
					this.autoQuality = false;
					if (index==this._qualities.length-1) {
						level = -1;
						this.autoQuality = true;
					}
					this._hls.currentLevel = level;
				}
				catch(err) {
	
				}
				return Promise.resolve();
			}
			else {
				return Promise.resolve();
			}
		}
	
		getNextQuality() {
			return new Promise((resolve,reject) => {
				let index = this.qualityIndex;
				resolve(this._qualities[index]);
			});
		}
		
		getCurrentQuality() {
			if (base.userAgent.system.iOS)// ||
				//base.userAgent.browser.Safari)
			{
				return Promise.resolve(0);
			}
			else {
				return new Promise((resolve,reject) => {
					resolve(this._qualities[this.qualityIndex]);
				});
			}
		}
	}

	paella.HLSPlayer = HLSPlayer;
	
	
	class HLSVideoFactory extends paella.VideoFactory {
		get config() {
			let hlsConfig = null;
			paella.player.config.player.methods.some((methodConfig) => {
				if (methodConfig.factory=="HLSVideoFactory") {
					hlsConfig = methodConfig;
				}
				return hlsConfig!=null;
			});
			return hlsConfig || {
				iOSMaxStreams: 1,
				androidMaxStreams: 1
			};
		}

		isStreamCompatible(streamData) {
			if (paella.videoFactories.HLSVideoFactory.s_instances===undefined) {
				paella.videoFactories.HLSVideoFactory.s_instances = 0;
			}
			try {
				let cfg = this.config;
				if ((base.userAgent.system.iOS &&
					paella.videoFactories.HLSVideoFactory.s_instances>=cfg.iOSMaxStreams) ||
					(base.userAgent.system.Android &&
					paella.videoFactories.HLSVideoFactory.s_instances>=cfg.androidMaxStreams))
			//	In some old mobile devices, playing a high number of HLS streams may cause that the browser tab crash
				{
					return false;
				}
				
				for (var key in streamData.sources) {
					if (key=='hls') return true;
				}
			}
			catch (e) {}
			return false;	
		}
	
		getVideoObject(id, streamData, rect) {
			++paella.videoFactories.HLSVideoFactory.s_instances;
			return new paella.HLSPlayer(id, streamData, rect.x, rect.y, rect.w, rect.h);
		}
	}

	paella.videoFactories.HLSVideoFactory = HLSVideoFactory;
	
})();
