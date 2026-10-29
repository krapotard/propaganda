<script setup>
import { useStore } from '@datastore';
const store = useStore();

store.fetchAll();
</script>

<template>
    <nav class="navbar is-fixed-top" role="navigation" aria-label="main navigation">
        <div class="navbar-brand">
            <b-navbar-item tag="router-link" :to="{ name: 'welcome' }" style="font-size: 15px">
                <instance-name :primaryBackground="false" />
            </b-navbar-item>

            <a
                role="button"
                :class="{ 'navbar-burger': true, 'is-active': expanded }"
                aria-label="menu"
                aria-expanded="false"
                data-target="vidaNavbar"
                @click="expanded = !expanded">
                <span aria-hidden="true"></span>
                <span aria-hidden="true"></span>
                <span aria-hidden="true"></span>
            </a>
        </div>

        <div id="vidaNavbar" :class="{ 'navbar-menu': true, 'is-active': expanded }">
            <div class="navbar-start">
                <b-navbar-item v-if="!compact"
                    tag="router-link"
                    :class="{ 'is-active': active === 'templates' }"
                    :to="{ name: 'templates', params: { lang: $i18n.locale } }"
                    :data-badge="store.modifiedTemplatesCount">
                    {{ $t('NAVBAR.TEMPLATES') }}
                </b-navbar-item>
                <b-navbar-item v-if="!compact"
                    tag="router-link"
                    :class="{ 'is-active': active == 'symbols' }"
                    :to="{ name: 'symbols', params: { lang: $i18n.locale } }"
                    :data-badge="store.modifiedImagesCount">
                    {{ $t('NAVBAR.SYMBOLS') }}
                </b-navbar-item>
                <b-navbar-item v-if="!compact"
                    tag="router-link"
                    :class="{ 'is-active': active === 'backgrounds' }"
                    :to="{ name: 'backgrounds', params: { lang: $i18n.locale } }"
                    :data-badge="store.modifiedBackgroundsCount">
                    {{ $t('NAVBAR.BACKGROUNDS') }}
                </b-navbar-item>
                <b-navbar-item v-if="!compact"
                    tag="router-link"
                    :class="{ 'is-active': active === 'colors' }"
                    :to="{ name: 'colors', params: { lang: $i18n.locale } }"
                    :data-badge="0">
                    {{ $t('NAVBAR.COLORS') }}
                </b-navbar-item>
                <b-navbar-item v-if="!compact" tag="router-link" :class="{ 'is-active': active === 'fonts' }" :to="{ name: 'fonts', params: { lang: $i18n.locale } }">
                    {{ $t('NAVBAR.FONTS') }}
                </b-navbar-item>
                <b-navbar-item v-if="!compact"
                    tag="router-link"
                    :class="{ 'is-active': active === 'qrcode' }"
                    :to="{ name: 'qrcode', params: { lang: $i18n.locale } }">
                    {{ $t('NAVBAR.QRCODE') }}
                </b-navbar-item>

                <b-navbar-item tag="router-link" :class="{ 'is-active': active === 'about' }" :to="{ name: 'about', params: { lang: $i18n.locale } }">
                    {{ $t('NAVBAR.ABOUT') }}
                </b-navbar-item>
            </div>

            <div class="navbar-end">
                <div class="navbar-item">
                    <slot name="import" />
                </div>
                <div class="navbar-item">
                    <slot name="export" />
                </div>
                <div class="navbar-item">
                    <lang-picker />
                </div>
                <div class="navbar-item">
                    <navbar-info />
                </div>
                <div class="navbar-item" v-if="me">
                    <b-dropdown position="is-bottom-left" aria-role="menu">
                        <template #trigger>
                            <b-button size="is-small" icon-left="account-circle-outline" icon-right="menu-down">{{ me.nom || me.identifiant }}</b-button>
                        </template>
                        <b-dropdown-item v-if="me.role === 'admin'" has-link aria-role="menuitem"><a href="/admin/">Bibliothèque d'images</a></b-dropdown-item>
                        <b-dropdown-item v-if="me.role === 'admin'" has-link aria-role="menuitem"><a href="/acces/comptes.php">Comptes</a></b-dropdown-item>
                        <b-dropdown-item has-link aria-role="menuitem"><a href="/acces/motdepasse.php">Mot de passe</a></b-dropdown-item>
                        <b-dropdown-item aria-role="menuitem" @click="logout">Se déconnecter</b-dropdown-item>
                    </b-dropdown>
                </div>
            </div>
        </div>
    </nav>
</template>

<script>
import LangPicker from '@/components/pickers/LangPicker.vue';
import InstanceName from '@/components/ui/instance-name.vue';
import NavbarInfo from '@/components/navbarinfo.vue';

export default {
    name: 'navbar',
    components: { LangPicker, InstanceName, NavbarInfo },
    props: {
        active: String,
        compact: Boolean, // éditeur : les rubriques sont rangées dans le menu latéral
    },
    data: () => ({
        expanded: false,
        me: null, // personne connectée (accès protégé, voir acces/)
    }),
    created() {
        fetch('/acces/moi.php', { credentials: 'same-origin' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (j && j.connecte) this.me = j; })
            .catch(() => {});
    },
    methods: {
        logout() {
            // déconnexion par POST avec jeton : un lien externe ne peut pas déconnecter
            const f = document.createElement('form');
            f.method = 'post';
            f.action = '/acces/logout.php';
            const i = document.createElement('input');
            i.type = 'hidden'; i.name = 'csrf'; i.value = this.me.csrf;
            f.appendChild(i);
            document.body.appendChild(f);
            f.submit();
        },
    },
};
</script>

<style lang="scss">
.navbar-item[data-badge]:not([data-badge='0'])::after {
    position: absolute;
    right: 0px;
    top: 10px;
    min-width: 10px;
    min-height: 10px;
    line-height: 6px;
    padding: 3px;
    color: var(--primary-text-color);
    background-color: var(--primary-color);
    font-size: 8px;
    border-radius: 20px;
    content: attr(data-badge);
    border: solid 1px var(--primary-color);
    opacity: 0.7;
}
</style>
