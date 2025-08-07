export async function getArgs() {
    const allowedArgs = [
        '-h',
        '--help',
        '-E',
        '--estimate',
        '-C',
        '--commit',
        '-P',
        '--push',
        '-A',
        '--add',
        '-v',
        '--verbose',
        '-i',
        '--interactive',
        '--hint',
        '--',
        'gg',
        '--voice',
        '--patch',
        '--cl',
        'pr',
    ];
    const rawArgs = process.argv.slice(2);
    const args = rawArgs.reduce((acc, arg) => {
        const [key, value] = arg.split('=');
        if (key.startsWith('--')) {
            const validArg = allowedArgs.includes(key);
            if (validArg)
                acc[key] = value || true;
        }
        else if (key.startsWith('-')) {
            for (let i = 1; i < key.length; i++) {
                const shortArg = '-' + key[i];
                if (allowedArgs.includes(shortArg))
                    acc[shortArg] = true;
            }
        }
        else if (key === 'gg' || key === 'pr') {
            acc[key] = true;
        }
        return acc;
    }, {});
    if (Object.keys(args).length === 0 && rawArgs.length > 0) {
        args['--hint'] = rawArgs.join(' ');
    }
    return args;
}
