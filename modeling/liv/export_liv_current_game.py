import os
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
source=open(os.path.join(ROOT,'modeling','liv','export_liv_sd_v6_game.py'),encoding='utf-8').read().replace('liv-sd-v6','liv-sd-v7')
exec(compile(source,__file__,'exec'))
