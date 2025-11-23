return {
	black = 0xff1a1b26,
	white = 0xffbdc7f0,
	red = 0xfff7768e,
	green = 0xff9ece6a,
	blue = 0xff3d59a1,
	yellow = 0xffe0af68,
	orange = 0xffff9e64,
	magenta = 0xffbb9af7,
	grey = 0xff959cbd,
	transparent = 0x00000000,
	bar = {
		bg = 0xff1a1b26,
		border = 0xff3d59a1,
	},
	popup = {
		bg = 0xff202330,
		border = 0xff3d59a1,
	},
	bg2 = 0xff292e42,
	bg1 = 0xff1f2335,

	with_alpha = function(color, alpha)
		if alpha > 1.0 or alpha < 0.0 then
			return color
		end
		return (color & 0x00ffffff) | (math.floor(alpha * 255.0) << 24)
	end,
}
